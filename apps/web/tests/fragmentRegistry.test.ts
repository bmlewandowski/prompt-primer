import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { Fragment, RegistryEntry } from "@prompt-primer/compiler";
import { rm, mkdir, writeFile, readFile, readdir } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { stringify } from "yaml";

// Create a temporary directory for test fixtures
const testDir = join(tmpdir(), `registry-test-${Date.now()}`);
const originalFragmentsRoot = process.env.FRAGMENTS_ROOT;

// Set environment variable before importing
process.env.FRAGMENTS_ROOT = testDir;

// Now import after setting env var
import {
  withWriteLock,
  invalidateRegistryCache,
  loadValidatedRegistry,
  loadTiersConfig,
  saveTiersConfig,
  regenerateRegistry,
  getFragmentById,
  saveFragment,
  deleteFragment,
  saveFragmentAndUpdateRegistry,
  deleteFragmentAndUpdateRegistry,
  createTierDirectory,
  DEFAULT_TIERS,
} from "../lib/fragmentRegistry";

beforeAll(async () => {
  await mkdir(testDir, { recursive: true });
});

afterAll(async () => {
  await rm(testDir, { recursive: true, force: true });
  if (originalFragmentsRoot) {
    process.env.FRAGMENTS_ROOT = originalFragmentsRoot;
  } else {
    delete process.env.FRAGMENTS_ROOT;
  }
});

beforeEach(async () => {
  // Clean test directory between tests
  try {
    const entries = await readdir(testDir);
    for (const entry of entries) {
      await rm(join(testDir, entry), { recursive: true, force: true });
    }
  } catch {
    // Ignore if empty
  }
  invalidateRegistryCache();
});

const createMockFragment = (id: string, tier: string = "task"): Fragment => ({
  id,
  tier,
  meta: {
    version: "1.0.0",
    description: "Test fragment",
    tags: [],
    author: "test",
    updated: "2026-05-31",
    fabric_source: null,
  },
  depends_on: [],
  replace_blocks: [],
  blocks: {
    identity: `Test identity for ${id}`,
    context: null,
    steps: null,
    rules: [],
  },
});

const createMockRegistryEntry = (
  id: string,
  tier: string,
  path: string
): RegistryEntry => ({
  id,
  tier,
  path,
  meta: {
    version: "1.0.0",
    description: "Test fragment",
    tags: [],
    author: "test",
    updated: "2026-05-31",
    fabric_source: null,
  },
  depends_on: [],
});

describe("withWriteLock", () => {
  it("executes function and returns result", async () => {
    const result = await withWriteLock(async () => {
      return 42;
    });
    expect(result).toBe(42);
  });

  it("executes async functions in sequence", async () => {
    const order: number[] = [];

    const promises = [
      withWriteLock(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        order.push(1);
      }),
      withWriteLock(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        order.push(2);
      }),
      withWriteLock(async () => {
        order.push(3);
      }),
    ];

    await Promise.all(promises);
    expect(order).toEqual([1, 2, 3]);
  });

  it("releases lock even when function throws", async () => {
    await expect(
      withWriteLock(async () => {
        throw new Error("Test error");
      })
    ).rejects.toThrow("Test error");

    // Should be able to acquire lock again
    const result = await withWriteLock(async () => "success");
    expect(result).toBe("success");
  });

  it("prevents concurrent writes from corrupting state", async () => {
    let counter = 0;

    const increment = async () => {
      return withWriteLock(async () => {
        const current = counter;
        await new Promise((resolve) => setTimeout(resolve, 10));
        counter = current + 1;
      });
    };

    await Promise.all([increment(), increment(), increment()]);
    expect(counter).toBe(3);
  });
});

describe("loadValidatedRegistry", () => {
  it("loads valid registry from disk", async () => {
    const mockRegistry = [
      createMockRegistryEntry("test_fragment", "task", "task/test_fragment.yaml"),
      createMockRegistryEntry("org_default", "org", "org/org_default.yaml"),
    ];

    await mkdir(join(testDir, ".registry.json").split("/").slice(0, -1).join("/"), {
      recursive: true,
    });
    await writeFile(
      join(testDir, ".registry.json"),
      JSON.stringify(mockRegistry, null, 2),
      "utf-8"
    );

    const { entries, allowedPaths } = await loadValidatedRegistry();

    expect(entries).toHaveLength(2);
    expect(allowedPaths.has("task/test_fragment.yaml")).toBe(true);
    expect(allowedPaths.has("org/org_default.yaml")).toBe(true);
  });

  it("caches registry after first load", async () => {
    const mockRegistry = [
      createMockRegistryEntry("test_fragment", "task", "task/test_fragment.yaml"),
    ];

    await writeFile(
      join(testDir, ".registry.json"),
      JSON.stringify(mockRegistry, null, 2),
      "utf-8"
    );

    const first = await loadValidatedRegistry();
    const second = await loadValidatedRegistry();

    expect(first).toBe(second); // Same reference = cached
  });

  it("throws when registry file is missing", async () => {
    await expect(loadValidatedRegistry()).rejects.toThrow(
      "Fragment registry not found"
    );
  });

  it("throws when registry is invalid JSON", async () => {
    await writeFile(join(testDir, ".registry.json"), "not valid json", "utf-8");

    await expect(loadValidatedRegistry()).rejects.toThrow("invalid JSON");
  });

  it("throws when registry is not an array", async () => {
    await writeFile(
      join(testDir, ".registry.json"),
      JSON.stringify({ notAnArray: true }),
      "utf-8"
    );

    await expect(loadValidatedRegistry()).rejects.toThrow("expected an array");
  });

  it("throws when registry contains invalid entry", async () => {
    const invalidRegistry = [
      { id: "test", tier: "task" }, // Missing required fields
    ];

    await writeFile(
      join(testDir, ".registry.json"),
      JSON.stringify(invalidRegistry, null, 2),
      "utf-8"
    );

    await expect(loadValidatedRegistry()).rejects.toThrow("invalid entry");
  });

  it("returns empty allowedPaths for empty registry", async () => {
    await writeFile(join(testDir, ".registry.json"), "[]", "utf-8");

    const { entries, allowedPaths } = await loadValidatedRegistry();

    expect(entries).toEqual([]);
    expect(allowedPaths.size).toBe(0);
  });
});

describe("invalidateRegistryCache", () => {
  it("clears cache forcing next load to read from disk", async () => {
    const mockRegistry = [
      createMockRegistryEntry("test_fragment", "task", "task/test_fragment.yaml"),
    ];

    await writeFile(
      join(testDir, ".registry.json"),
      JSON.stringify(mockRegistry, null, 2),
      "utf-8"
    );

    const first = await loadValidatedRegistry();
    invalidateRegistryCache();
    const second = await loadValidatedRegistry();

    expect(first).not.toBe(second); // Different references = cache was cleared
  });
});

describe("loadTiersConfig", () => {
  it("loads tiers config from disk", async () => {
    const mockConfig = {
      tiers: [
        { id: "org", label: "Organization" },
        { id: "team", label: "Team" },
      ],
    };

    await writeFile(
      join(testDir, "tiers.json"),
      JSON.stringify(mockConfig, null, 2),
      "utf-8"
    );

    const config = await loadTiersConfig();
    expect(config.tiers).toHaveLength(2);
    expect(config.tiers[0].id).toBe("org");
  });

  it("returns default tiers when file does not exist", async () => {
    const config = await loadTiersConfig();
    expect(config.tiers).toEqual(DEFAULT_TIERS);
  });

  it("returns default tiers when tiers is not an array", async () => {
    await writeFile(
      join(testDir, "tiers.json"),
      JSON.stringify({ notTiers: true }),
      "utf-8"
    );

    const config = await loadTiersConfig();
    expect(config.tiers).toEqual(DEFAULT_TIERS);
  });

  it("throws on other read errors", async () => {
    await writeFile(join(testDir, "tiers.json"), "invalid json", "utf-8");

    await expect(loadTiersConfig()).rejects.toThrow();
  });
});

describe("saveTiersConfig", () => {
  it("writes tiers config to disk", async () => {
    const config = {
      tiers: [
        { id: "org", label: "Organization" },
        { id: "custom", label: "Custom Tier" },
      ],
    };

    await saveTiersConfig(config);

    const content = await readFile(join(testDir, "tiers.json"), "utf-8");
    const parsed = JSON.parse(content);

    expect(parsed.tiers).toHaveLength(2);
    expect(parsed.tiers[1].id).toBe("custom");
  });
});

describe("regenerateRegistry", () => {
  it("generates registry from YAML files", async () => {
    await mkdir(join(testDir, "task"), { recursive: true });
    await mkdir(join(testDir, "org"), { recursive: true });

    const fragment1 = createMockFragment("test_fragment", "task");
    const fragment2 = createMockFragment("org_default", "org");

    await writeFile(
      join(testDir, "task", "test_fragment.yaml"),
      stringify(fragment1),
      "utf-8"
    );
    await writeFile(
      join(testDir, "org", "org_default.yaml"),
      stringify(fragment2),
      "utf-8"
    );

    const count = await regenerateRegistry();

    expect(count).toBe(2);

    const registryContent = await readFile(join(testDir, ".registry.json"), "utf-8");
    const registry = JSON.parse(registryContent);

    expect(registry).toHaveLength(2);
    expect(registry.some((e: RegistryEntry) => e.id === "test_fragment")).toBe(true);
    expect(registry.some((e: RegistryEntry) => e.id === "org_default")).toBe(true);
  });

  it("sorts entries by tier order then id", async () => {
    await mkdir(join(testDir, "task"), { recursive: true });
    await mkdir(join(testDir, "org"), { recursive: true });
    await mkdir(join(testDir, "team"), { recursive: true });

    const fragments = [
      createMockFragment("zebra", "task"),
      createMockFragment("alpha", "task"),
      createMockFragment("beta", "org"),
      createMockFragment("gamma", "team"),
    ];

    for (const frag of fragments) {
      await writeFile(
        join(testDir, frag.tier, `${frag.id}.yaml`),
        stringify(frag),
        "utf-8"
      );
    }

    await regenerateRegistry();

    const registryContent = await readFile(join(testDir, ".registry.json"), "utf-8");
    const registry = JSON.parse(registryContent) as RegistryEntry[];

    // org < team < task, then alphabetical within tier
    expect(registry[0].id).toBe("beta"); // org
    expect(registry[1].id).toBe("gamma"); // team
    expect(registry[2].id).toBe("alpha"); // task
    expect(registry[3].id).toBe("zebra"); // task
  });

  it("updates cache after regeneration", async () => {
    await mkdir(join(testDir, "task"), { recursive: true });

    const fragment = createMockFragment("test_fragment", "task");
    await writeFile(
      join(testDir, "task", "test_fragment.yaml"),
      stringify(fragment),
      "utf-8"
    );

    await regenerateRegistry();

    // Should not read from disk because cache was updated
    const { entries } = await loadValidatedRegistry();
    expect(entries).toHaveLength(1);
  });

  it("throws when YAML files contain schema errors", async () => {
    await mkdir(join(testDir, "task"), { recursive: true });

    const invalidFragment = {
      id: "invalid",
      tier: "task",
      // Missing required fields
    };

    await writeFile(
      join(testDir, "task", "invalid.yaml"),
      stringify(invalidFragment),
      "utf-8"
    );

    await expect(regenerateRegistry()).rejects.toThrow("Registry errors");
  });

  it("skips hidden directories and scripts", async () => {
    await mkdir(join(testDir, ".hidden"), { recursive: true });
    await mkdir(join(testDir, "scripts"), { recursive: true });
    await mkdir(join(testDir, "task"), { recursive: true });

    const hiddenFrag = createMockFragment("hidden", "task");
    const scriptFrag = createMockFragment("script", "task");
    const validFrag = createMockFragment("valid", "task");

    await writeFile(
      join(testDir, ".hidden", "hidden.yaml"),
      stringify(hiddenFrag),
      "utf-8"
    );
    await writeFile(
      join(testDir, "scripts", "script.yaml"),
      stringify(scriptFrag),
      "utf-8"
    );
    await writeFile(
      join(testDir, "task", "valid.yaml"),
      stringify(validFrag),
      "utf-8"
    );

    const count = await regenerateRegistry();

    expect(count).toBe(1); // Only valid.yaml
  });
});

describe("getFragmentById", () => {
  it("retrieves fragment by id", async () => {
    await mkdir(join(testDir, "task"), { recursive: true });

    const fragment = createMockFragment("test_fragment", "task");
    await writeFile(
      join(testDir, "task", "test_fragment.yaml"),
      stringify(fragment),
      "utf-8"
    );

    const mockRegistry = [
      createMockRegistryEntry("test_fragment", "task", "task/test_fragment.yaml"),
    ];
    await writeFile(
      join(testDir, ".registry.json"),
      JSON.stringify(mockRegistry, null, 2),
      "utf-8"
    );

    const result = await getFragmentById("test_fragment");

    expect(result).not.toBeNull();
    expect(result?.id).toBe("test_fragment");
    expect(result?.blocks.identity).toContain("test_fragment");
  });

  it("returns null when fragment not in registry", async () => {
    await writeFile(join(testDir, ".registry.json"), "[]", "utf-8");

    const result = await getFragmentById("nonexistent");
    expect(result).toBeNull();
  });

  it("returns null when registry is missing", async () => {
    const result = await getFragmentById("test");
    expect(result).toBeNull();
  });

  it("returns null when fragment file is missing", async () => {
    const mockRegistry = [
      createMockRegistryEntry("test_fragment", "task", "task/test_fragment.yaml"),
    ];
    await writeFile(
      join(testDir, ".registry.json"),
      JSON.stringify(mockRegistry, null, 2),
      "utf-8"
    );

    const result = await getFragmentById("test_fragment");
    expect(result).toBeNull();
  });

  it("returns null when fragment has invalid schema", async () => {
    await mkdir(join(testDir, "task"), { recursive: true });

    await writeFile(
      join(testDir, "task", "invalid.yaml"),
      stringify({ id: "invalid", tier: "task" }), // Missing required fields
      "utf-8"
    );

    const mockRegistry = [
      createMockRegistryEntry("invalid", "task", "task/invalid.yaml"),
    ];
    await writeFile(
      join(testDir, ".registry.json"),
      JSON.stringify(mockRegistry, null, 2),
      "utf-8"
    );

    const result = await getFragmentById("invalid");
    expect(result).toBeNull();
  });

  it("rejects path traversal attempts", async () => {
    const mockRegistry = [
      createMockRegistryEntry("evil", "task", "../../../etc/passwd"),
    ];
    await writeFile(
      join(testDir, ".registry.json"),
      JSON.stringify(mockRegistry, null, 2),
      "utf-8"
    );

    const result = await getFragmentById("evil");
    expect(result).toBeNull();
  });
});

describe("saveFragment", () => {
  it("writes fragment to disk", async () => {
    const fragment = createMockFragment("test_fragment", "task");

    await saveFragment(fragment);

    const content = await readFile(
      join(testDir, "task", "test_fragment.yaml"),
      "utf-8"
    );
    expect(content).toContain("id: test_fragment");
    expect(content).toContain("tier: task");
  });

  it("creates directory if it does not exist", async () => {
    const fragment = createMockFragment("new_fragment", "custom_tier");

    await saveFragment(fragment);

    const content = await readFile(
      join(testDir, "custom_tier", "new_fragment.yaml"),
      "utf-8"
    );
    expect(content).toContain("id: new_fragment");
  });

  it("updates the updated field to current date", async () => {
    const fragment = createMockFragment("test_fragment", "task");
    fragment.meta.updated = "2020-01-01";

    await saveFragment(fragment);

    const content = await readFile(
      join(testDir, "task", "test_fragment.yaml"),
      "utf-8"
    );
    const currentDate = new Date().toISOString().split("T")[0];
    // YAML may or may not quote the date depending on the stringifier
    expect(content).toMatch(new RegExp(`updated: ['"]?${currentDate}['"]?`));
  });

  it("deletes old file when previousPath is provided and different", async () => {
    await mkdir(join(testDir, "task"), { recursive: true });
    await writeFile(join(testDir, "task", "old_name.yaml"), "old content", "utf-8");

    const fragment = createMockFragment("new_name", "task");

    await saveFragment(fragment, "task/old_name.yaml");

    const newExists = await readFile(join(testDir, "task", "new_name.yaml"), "utf-8")
      .then(() => true)
      .catch(() => false);
    const oldExists = await readFile(join(testDir, "task", "old_name.yaml"), "utf-8")
      .then(() => true)
      .catch(() => false);

    expect(newExists).toBe(true);
    expect(oldExists).toBe(false);
  });

  it("does not delete file when previousPath matches new path", async () => {
    await mkdir(join(testDir, "task"), { recursive: true });
    const fragment = createMockFragment("test_fragment", "task");

    await saveFragment(fragment, "task/test_fragment.yaml");

    const exists = await readFile(
      join(testDir, "task", "test_fragment.yaml"),
      "utf-8"
    )
      .then(() => true)
      .catch(() => false);

    expect(exists).toBe(true);
  });

  it("omits replace_blocks when empty", async () => {
    const fragment = createMockFragment("test_fragment", "task");
    fragment.replace_blocks = [];

    await saveFragment(fragment);

    const content = await readFile(
      join(testDir, "task", "test_fragment.yaml"),
      "utf-8"
    );
    expect(content).not.toContain("replace_blocks");
  });

  it("includes replace_blocks when not empty", async () => {
    const fragment = createMockFragment("test_fragment", "task");
    fragment.replace_blocks = ["identity", "context"];

    await saveFragment(fragment);

    const content = await readFile(
      join(testDir, "task", "test_fragment.yaml"),
      "utf-8"
    );
    expect(content).toContain("replace_blocks");
    expect(content).toContain("- identity");
    expect(content).toContain("- context");
  });

  it("rejects unsafe tier id", async () => {
    const fragment = createMockFragment("test", "../evil");

    await expect(saveFragment(fragment)).rejects.toThrow("Invalid tier id");
  });

  it("rejects unsafe fragment id", async () => {
    const fragment = createMockFragment("../evil", "task");

    await expect(saveFragment(fragment)).rejects.toThrow("Invalid fragment id");
  });

  it("rejects path traversal in tier", async () => {
    const fragment = createMockFragment("test", "../../evil");

    await expect(saveFragment(fragment)).rejects.toThrow();
  });
});

describe("deleteFragment", () => {
  it("deletes fragment file from disk", async () => {
    await mkdir(join(testDir, "task"), { recursive: true });
    await writeFile(
      join(testDir, "task", "test_fragment.yaml"),
      stringify(createMockFragment("test_fragment", "task")),
      "utf-8"
    );

    const mockRegistry = [
      createMockRegistryEntry("test_fragment", "task", "task/test_fragment.yaml"),
    ];
    await writeFile(
      join(testDir, ".registry.json"),
      JSON.stringify(mockRegistry, null, 2),
      "utf-8"
    );

    await deleteFragment("test_fragment");

    const exists = await readFile(join(testDir, "task", "test_fragment.yaml"), "utf-8")
      .then(() => true)
      .catch(() => false);

    expect(exists).toBe(false);
  });

  it("throws when fragment not found in registry", async () => {
    await writeFile(join(testDir, ".registry.json"), "[]", "utf-8");

    await expect(deleteFragment("nonexistent")).rejects.toThrow("not found");
  });

  it("throws when registry is not available", async () => {
    await expect(deleteFragment("test")).rejects.toThrow("Registry not available");
  });

  it("rejects path traversal attempts", async () => {
    const mockRegistry = [
      createMockRegistryEntry("evil", "task", "../../../etc/passwd"),
    ];
    await writeFile(
      join(testDir, ".registry.json"),
      JSON.stringify(mockRegistry, null, 2),
      "utf-8"
    );

    await expect(deleteFragment("evil")).rejects.toThrow("Path traversal rejected");
  });
});

describe("saveFragmentAndUpdateRegistry", () => {
  it("saves fragment and updates registry", async () => {
    const fragment = createMockFragment("test_fragment", "task");

    await saveFragmentAndUpdateRegistry(fragment);

    const fileExists = await readFile(
      join(testDir, "task", "test_fragment.yaml"),
      "utf-8"
    )
      .then(() => true)
      .catch(() => false);

    const registryContent = await readFile(join(testDir, ".registry.json"), "utf-8");
    const registry = JSON.parse(registryContent) as RegistryEntry[];

    expect(fileExists).toBe(true);
    expect(registry).toHaveLength(1);
    expect(registry[0].id).toBe("test_fragment");
  });

  it("updates existing fragment in registry", async () => {
    const fragment1 = createMockFragment("test_fragment", "task");
    await saveFragmentAndUpdateRegistry(fragment1);

    const fragment2 = { ...fragment1, blocks: { ...fragment1.blocks, identity: "Updated" } };
    await saveFragmentAndUpdateRegistry(fragment2);

    const registryContent = await readFile(join(testDir, ".registry.json"), "utf-8");
    const registry = JSON.parse(registryContent) as RegistryEntry[];

    expect(registry).toHaveLength(1);
    expect(registry[0].id).toBe("test_fragment");
  });

  it("removes old entry when previousPath is provided", async () => {
    await mkdir(join(testDir, "task"), { recursive: true });
    await writeFile(join(testDir, "task", "old_name.yaml"), "old", "utf-8");

    const mockRegistry = [
      createMockRegistryEntry("old_name", "task", "task/old_name.yaml"),
    ];
    await writeFile(
      join(testDir, ".registry.json"),
      JSON.stringify(mockRegistry, null, 2),
      "utf-8"
    );
    invalidateRegistryCache();

    const fragment = createMockFragment("new_name", "task");
    await saveFragmentAndUpdateRegistry(fragment, "task/old_name.yaml");

    const registryContent = await readFile(join(testDir, ".registry.json"), "utf-8");
    const registry = JSON.parse(registryContent) as RegistryEntry[];

    expect(registry).toHaveLength(1);
    expect(registry[0].id).toBe("new_name");
    expect(registry.find((e) => e.id === "old_name")).toBeUndefined();
  });

  it("updates cache after save", async () => {
    const fragment = createMockFragment("test_fragment", "task");
    await saveFragmentAndUpdateRegistry(fragment);

    // Should not read from disk because cache was updated
    const { entries } = await loadValidatedRegistry();
    expect(entries).toHaveLength(1);
    expect(entries[0].id).toBe("test_fragment");
  });

  it("sorts registry by tier order", async () => {
    const tiersConfig = {
      tiers: [
        { id: "org", label: "Org" },
        { id: "team", label: "Team" },
        { id: "task", label: "Task" },
      ],
    };
    await saveTiersConfig(tiersConfig);

    const fragments = [
      createMockFragment("task_frag", "task"),
      createMockFragment("org_frag", "org"),
      createMockFragment("team_frag", "team"),
    ];

    for (const frag of fragments) {
      await saveFragmentAndUpdateRegistry(frag);
    }

    const registryContent = await readFile(join(testDir, ".registry.json"), "utf-8");
    const registry = JSON.parse(registryContent) as RegistryEntry[];

    expect(registry[0].id).toBe("org_frag");
    expect(registry[1].id).toBe("team_frag");
    expect(registry[2].id).toBe("task_frag");
  });

  it("creates registry from scratch if missing", async () => {
    const fragment = createMockFragment("test_fragment", "task");
    await saveFragmentAndUpdateRegistry(fragment);

    const registryContent = await readFile(join(testDir, ".registry.json"), "utf-8");
    const registry = JSON.parse(registryContent);

    expect(registry).toHaveLength(1);
  });
});

describe("deleteFragmentAndUpdateRegistry", () => {
  it("deletes fragment and updates registry", async () => {
    await mkdir(join(testDir, "task"), { recursive: true });
    await writeFile(
      join(testDir, "task", "test_fragment.yaml"),
      stringify(createMockFragment("test_fragment", "task")),
      "utf-8"
    );

    const mockRegistry = [
      createMockRegistryEntry("test_fragment", "task", "task/test_fragment.yaml"),
    ];
    await writeFile(
      join(testDir, ".registry.json"),
      JSON.stringify(mockRegistry, null, 2),
      "utf-8"
    );

    await deleteFragmentAndUpdateRegistry("test_fragment");

    const fileExists = await readFile(
      join(testDir, "task", "test_fragment.yaml"),
      "utf-8"
    )
      .then(() => true)
      .catch(() => false);

    const registryContent = await readFile(join(testDir, ".registry.json"), "utf-8");
    const registry = JSON.parse(registryContent);

    expect(fileExists).toBe(false);
    expect(registry).toHaveLength(0);
  });

  it("updates cache after delete", async () => {
    await mkdir(join(testDir, "task"), { recursive: true });
    await writeFile(
      join(testDir, "task", "test_fragment.yaml"),
      stringify(createMockFragment("test_fragment", "task")),
      "utf-8"
    );

    const mockRegistry = [
      createMockRegistryEntry("test_fragment", "task", "task/test_fragment.yaml"),
    ];
    await writeFile(
      join(testDir, ".registry.json"),
      JSON.stringify(mockRegistry, null, 2),
      "utf-8"
    );

    await deleteFragmentAndUpdateRegistry("test_fragment");

    const { entries } = await loadValidatedRegistry();
    expect(entries).toHaveLength(0);
  });

  it("handles missing registry file gracefully", async () => {
    await mkdir(join(testDir, "task"), { recursive: true });
    await writeFile(
      join(testDir, "task", "test_fragment.yaml"),
      stringify(createMockFragment("test_fragment", "task")),
      "utf-8"
    );

    const mockRegistry = [
      createMockRegistryEntry("test_fragment", "task", "task/test_fragment.yaml"),
    ];
    await writeFile(
      join(testDir, ".registry.json"),
      JSON.stringify(mockRegistry, null, 2),
      "utf-8"
    );
    invalidateRegistryCache();

    await rm(join(testDir, ".registry.json"), { force: true });

    await expect(deleteFragmentAndUpdateRegistry("test_fragment")).rejects.toThrow();
  });
});

describe("createTierDirectory", () => {
  it("creates tier directory", async () => {
    await createTierDirectory("custom_tier");

    const entries = await readdir(testDir);
    expect(entries).toContain("custom_tier");
  });

  it("creates nested directory structure", async () => {
    await createTierDirectory("custom");

    const path = join(testDir, "custom");
    const entries = await readdir(path).catch(() => null);
    expect(entries).not.toBeNull();
  });

  it("does not throw if directory already exists", async () => {
    await mkdir(join(testDir, "existing"), { recursive: true });

    await expect(createTierDirectory("existing")).resolves.not.toThrow();
  });

  it("rejects unsafe tier id with special characters", async () => {
    await expect(createTierDirectory("evil/../../../etc")).rejects.toThrow(
      "Invalid tier id"
    );
  });

  it("rejects tier id with path traversal", async () => {
    await expect(createTierDirectory("..")).rejects.toThrow("Invalid tier id");
  });

  it("allows valid tier ids with hyphens and underscores", async () => {
    await createTierDirectory("custom-tier_1");

    const entries = await readdir(testDir);
    expect(entries).toContain("custom-tier_1");
  });
});
