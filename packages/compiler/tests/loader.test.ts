import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { loadFragment, loadFragments, FragmentLoadError } from "../src/loader.js";
import { writeFile, mkdir, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

// Create a temporary directory for test fixtures
const testDir = join(tmpdir(), `prompt-primer-test-${Date.now()}`);

beforeAll(async () => {
  await mkdir(testDir, { recursive: true });
});

afterAll(async () => {
  await rm(testDir, { recursive: true, force: true });
});

describe("loadFragment", () => {
  describe("valid fragments", () => {
    it("loads a minimal valid fragment", async () => {
      const fragmentPath = join(testDir, "minimal.yaml");
      const yaml = `id: test_fragment
tier: task
meta:
  version: "1.0.0"
  description: "Test fragment"
  tags: []
  author: "test"
  updated: "2026-05-31"
  fabric_source: null
depends_on: []
replace_blocks: []
blocks:
  identity: null
  context: null
  steps: null
  rules: []`;

      await writeFile(fragmentPath, yaml, "utf-8");
      const fragment = await loadFragment(fragmentPath);

      expect(fragment.id).toBe("test_fragment");
      expect(fragment.tier).toBe("task");
      expect(fragment.meta.version).toBe("1.0.0");
    });

    it("loads a fragment with all blocks populated", async () => {
      const fragmentPath = join(testDir, "full.yaml");
      const yaml = `id: full_fragment
tier: org
meta:
  version: "2.3.1"
  description: "Complete fragment"
  tags: [test, complete]
  author: "tester"
  updated: "2026-05-31"
  fabric_source: "https://example.com/pattern"
depends_on: [dependency_1, dependency_2]
replace_blocks: [identity, context]
blocks:
  identity: |
    You are an expert assistant.
    You have deep knowledge.
  context: |
    Current context information.
  steps: |
    1. Analyze
    2. Respond
  rules:
    - content: "Be accurate"
    - key: "format"
      content: "Use Markdown"`;

      await writeFile(fragmentPath, yaml, "utf-8");
      const fragment = await loadFragment(fragmentPath);

      expect(fragment.id).toBe("full_fragment");
      expect(fragment.blocks.identity).toContain("expert assistant");
      expect(fragment.blocks.context).toContain("Current context");
      expect(fragment.blocks.steps).toContain("Analyze");
      expect(fragment.blocks.rules).toHaveLength(2);
      expect(fragment.depends_on).toEqual(["dependency_1", "dependency_2"]);
      expect(fragment.replace_blocks).toEqual(["identity", "context"]);
    });

    it("loads a fragment with keyed and unnamed rules", async () => {
      const fragmentPath = join(testDir, "rules.yaml");
      const yaml = `id: rules_fragment
tier: team
meta:
  version: "1.0.0"
  description: "Rules test"
  tags: []
  author: "test"
  updated: "2026-05-31"
  fabric_source: null
depends_on: []
blocks:
  identity: null
  context: null
  steps: null
  rules:
    - content: "Always be respectful"
    - key: "tone"
      content: "Use professional tone"
    - content: "Never guess"`;

      await writeFile(fragmentPath, yaml, "utf-8");
      const fragment = await loadFragment(fragmentPath);

      expect(fragment.blocks.rules).toHaveLength(3);
      expect(fragment.blocks.rules[0].key).toBeUndefined();
      expect(fragment.blocks.rules[1].key).toBe("tone");
      expect(fragment.blocks.rules[2].key).toBeUndefined();
    });

    it("handles multiline block content", async () => {
      const fragmentPath = join(testDir, "multiline.yaml");
      const yaml = `id: multiline_fragment
tier: task
meta:
  version: "1.0.0"
  description: "Multiline test"
  tags: []
  author: "test"
  updated: "2026-05-31"
  fabric_source: null
depends_on: []
blocks:
  identity: |
    Line 1 of identity
    Line 2 of identity
    Line 3 of identity
  context: null
  steps: null
  rules: []`;

      await writeFile(fragmentPath, yaml, "utf-8");
      const fragment = await loadFragment(fragmentPath);

      expect(fragment.blocks.identity).toContain("Line 1");
      expect(fragment.blocks.identity).toContain("Line 2");
      expect(fragment.blocks.identity).toContain("Line 3");
    });
  });

  describe("error handling — missing files", () => {
    it("throws FragmentLoadError for non-existent file", async () => {
      const fragmentPath = join(testDir, "does-not-exist.yaml");

      await expect(loadFragment(fragmentPath)).rejects.toThrow(FragmentLoadError);
    });

    it("includes path in error for missing file", async () => {
      const fragmentPath = join(testDir, "missing.yaml");

      try {
        await loadFragment(fragmentPath);
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(FragmentLoadError);
        expect((err as FragmentLoadError).path).toBe(fragmentPath);
      }
    });
  });

  describe("error handling — invalid YAML", () => {
    it("throws FragmentLoadError for malformed YAML", async () => {
      const fragmentPath = join(testDir, "invalid.yaml");
      const yaml = `id: test
tier: task
blocks:
  identity: "unterminated string`;

      await writeFile(fragmentPath, yaml, "utf-8");

      await expect(loadFragment(fragmentPath)).rejects.toThrow(FragmentLoadError);
    });

    it("throws FragmentLoadError for YAML with invalid indentation", async () => {
      const fragmentPath = join(testDir, "bad-indent.yaml");
      const yaml = `id: test
  tier: task
 blocks:
identity: "Bad indentation"`;

      await writeFile(fragmentPath, yaml, "utf-8");

      await expect(loadFragment(fragmentPath)).rejects.toThrow(FragmentLoadError);
    });

    it("error message mentions YAML parse error", async () => {
      const fragmentPath = join(testDir, "parse-error.yaml");
      const yaml = `id: test
blocks: [unclosed bracket`;

      await writeFile(fragmentPath, yaml, "utf-8");

      try {
        await loadFragment(fragmentPath);
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(FragmentLoadError);
        expect((err as Error).message).toContain("YAML parse error");
      }
    });
  });

  describe("error handling — schema validation", () => {
    it("rejects fragment with missing required id field", async () => {
      const fragmentPath = join(testDir, "no-id.yaml");
      const yaml = `tier: task
meta:
  version: "1.0.0"
  description: "No ID"
  tags: []
  author: "test"
  updated: "2026-05-31"
blocks:
  identity: null
  context: null
  steps: null
  rules: []`;

      await writeFile(fragmentPath, yaml, "utf-8");

      await expect(loadFragment(fragmentPath)).rejects.toThrow(FragmentLoadError);
    });

    it("rejects fragment with invalid id format", async () => {
      const fragmentPath = join(testDir, "bad-id.yaml");
      const yaml = `id: "Invalid ID With Spaces!"
tier: task
meta:
  version: "1.0.0"
  description: "Bad ID"
  tags: []
  author: "test"
  updated: "2026-05-31"
blocks:
  identity: null
  context: null
  steps: null
  rules: []`;

      await writeFile(fragmentPath, yaml, "utf-8");

      await expect(loadFragment(fragmentPath)).rejects.toThrow(FragmentLoadError);
    });

    it("rejects fragment with invalid semver version", async () => {
      const fragmentPath = join(testDir, "bad-version.yaml");
      const yaml = `id: test_fragment
tier: task
meta:
  version: "not-semver"
  description: "Bad version"
  tags: []
  author: "test"
  updated: "2026-05-31"
blocks:
  identity: null
  context: null
  steps: null
  rules: []`;

      await writeFile(fragmentPath, yaml, "utf-8");

      await expect(loadFragment(fragmentPath)).rejects.toThrow(FragmentLoadError);
    });

    it("rejects fragment with empty tier", async () => {
      const fragmentPath = join(testDir, "empty-tier.yaml");
      const yaml = `id: test_fragment
tier: ""
meta:
  version: "1.0.0"
  description: "Empty tier"
  tags: []
  author: "test"
  updated: "2026-05-31"
blocks:
  identity: null
  context: null
  steps: null
  rules: []`;

      await writeFile(fragmentPath, yaml, "utf-8");

      await expect(loadFragment(fragmentPath)).rejects.toThrow(FragmentLoadError);
    });

    it("rejects fragment with empty rule content", async () => {
      const fragmentPath = join(testDir, "empty-rule.yaml");
      const yaml = `id: test_fragment
tier: task
meta:
  version: "1.0.0"
  description: "Empty rule"
  tags: []
  author: "test"
  updated: "2026-05-31"
blocks:
  identity: null
  context: null
  steps: null
  rules:
    - content: ""`;

      await writeFile(fragmentPath, yaml, "utf-8");

      await expect(loadFragment(fragmentPath)).rejects.toThrow(FragmentLoadError);
    });

    it("rejects fragment with duplicate rule keys", async () => {
      const fragmentPath = join(testDir, "duplicate-keys.yaml");
      const yaml = `id: test_fragment
tier: task
meta:
  version: "1.0.0"
  description: "Duplicate keys"
  tags: []
  author: "test"
  updated: "2026-05-31"
blocks:
  identity: null
  context: null
  steps: null
  rules:
    - key: "format"
      content: "First rule"
    - key: "format"
      content: "Second rule with same key"`;

      await writeFile(fragmentPath, yaml, "utf-8");

      await expect(loadFragment(fragmentPath)).rejects.toThrow(FragmentLoadError);
    });

    it("rejects fragment with invalid fabric_source URL", async () => {
      const fragmentPath = join(testDir, "bad-url.yaml");
      const yaml = `id: test_fragment
tier: task
meta:
  version: "1.0.0"
  description: "Bad URL"
  tags: []
  author: "test"
  updated: "2026-05-31"
  fabric_source: "not-a-valid-url"
blocks:
  identity: null
  context: null
  steps: null
  rules: []`;

      await writeFile(fragmentPath, yaml, "utf-8");

      await expect(loadFragment(fragmentPath)).rejects.toThrow(FragmentLoadError);
    });

    it("provides detailed error message for validation failures", async () => {
      const fragmentPath = join(testDir, "validation-fail.yaml");
      const yaml = `id: "Bad ID!"
tier: task
meta:
  version: "bad"
  description: "Multiple errors"
  tags: []
  author: "test"
  updated: "2026-05-31"
blocks:
  identity: null
  context: null
  steps: null
  rules: []`;

      await writeFile(fragmentPath, yaml, "utf-8");

      try {
        await loadFragment(fragmentPath);
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(FragmentLoadError);
        const message = (err as Error).message;
        expect(message).toContain("Schema validation failed");
        expect(message).toContain(fragmentPath);
      }
    });

    it("accepts valid replace_blocks values", async () => {
      const fragmentPath = join(testDir, "replace-blocks.yaml");
      const yaml = `id: test_fragment
tier: task
meta:
  version: "1.0.0"
  description: "Replace blocks test"
  tags: []
  author: "test"
  updated: "2026-05-31"
replace_blocks: [identity, context, steps]
blocks:
  identity: "New identity"
  context: null
  steps: null
  rules: []`;

      await writeFile(fragmentPath, yaml, "utf-8");
      const fragment = await loadFragment(fragmentPath);

      expect(fragment.replace_blocks).toEqual(["identity", "context", "steps"]);
    });

    it("rejects invalid replace_blocks values", async () => {
      const fragmentPath = join(testDir, "bad-replace.yaml");
      const yaml = `id: test_fragment
tier: task
meta:
  version: "1.0.0"
  description: "Invalid replace_blocks"
  tags: []
  author: "test"
  updated: "2026-05-31"
replace_blocks: [identity, invalid_block]
blocks:
  identity: null
  context: null
  steps: null
  rules: []`;

      await writeFile(fragmentPath, yaml, "utf-8");

      await expect(loadFragment(fragmentPath)).rejects.toThrow(FragmentLoadError);
    });
  });
});

describe("loadFragments", () => {
  it("loads multiple fragments in parallel", async () => {
    const paths = [];
    for (let i = 0; i < 3; i++) {
      const path = join(testDir, `batch-${i}.yaml`);
      const yaml = `id: batch_${i}
tier: task
meta:
  version: "1.0.0"
  description: "Batch ${i}"
  tags: []
  author: "test"
  updated: "2026-05-31"
blocks:
  identity: "Identity ${i}"
  context: null
  steps: null
  rules: []`;
      await writeFile(path, yaml, "utf-8");
      paths.push(path);
    }

    const fragments = await loadFragments(paths);

    expect(fragments).toHaveLength(3);
    expect(fragments[0].id).toBe("batch_0");
    expect(fragments[1].id).toBe("batch_1");
    expect(fragments[2].id).toBe("batch_2");
  });

  it("preserves input order", async () => {
    const paths = [];
    for (let i = 5; i > 0; i--) {
      const path = join(testDir, `order-${i}.yaml`);
      const yaml = `id: order_${i}
tier: task
meta:
  version: "1.0.0"
  description: "Order ${i}"
  tags: []
  author: "test"
  updated: "2026-05-31"
blocks:
  identity: null
  context: null
  steps: null
  rules: []`;
      await writeFile(path, yaml, "utf-8");
      paths.push(path);
    }

    const fragments = await loadFragments(paths);

    expect(fragments[0].id).toBe("order_5");
    expect(fragments[1].id).toBe("order_4");
    expect(fragments[2].id).toBe("order_3");
    expect(fragments[3].id).toBe("order_2");
    expect(fragments[4].id).toBe("order_1");
  });

  it("fails if any fragment is invalid", async () => {
    const validPath = join(testDir, "valid-batch.yaml");
    const invalidPath = join(testDir, "invalid-batch.yaml");

    const validYaml = `id: valid_fragment
tier: task
meta:
  version: "1.0.0"
  description: "Valid"
  tags: []
  author: "test"
  updated: "2026-05-31"
blocks:
  identity: null
  context: null
  steps: null
  rules: []`;

    const invalidYaml = `id: invalid
tier: task
blocks: [malformed`;

    await writeFile(validPath, validYaml, "utf-8");
    await writeFile(invalidPath, invalidYaml, "utf-8");

    await expect(loadFragments([validPath, invalidPath])).rejects.toThrow(
      FragmentLoadError
    );
  });

  it("handles empty array", async () => {
    const fragments = await loadFragments([]);
    expect(fragments).toHaveLength(0);
  });
});
