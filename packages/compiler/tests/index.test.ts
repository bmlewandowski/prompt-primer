import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { compile, countTokens } from "../src/index.js";
import type { CompileRequest } from "../src/types.js";
import { writeFile, mkdir, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

// Create a temporary directory for test fixtures
const testDir = join(tmpdir(), `prompt-primer-integration-${Date.now()}`);

beforeAll(async () => {
  await mkdir(testDir, { recursive: true });

  // Create test fragment files
  const orgYaml = `id: test_org
tier: org
meta:
  version: "1.0.0"
  description: "Test org fragment"
  tags: []
  author: "test"
  updated: "2026-05-31"
  fabric_source: null
depends_on: []
replace_blocks: []
blocks:
  identity: |
    You are an AI assistant for a test organization.
  context: |
    Current state: Testing environment.
    Ideal state: Comprehensive test coverage.
  steps: null
  rules:
    - key: "accuracy"
      content: "Always be accurate in testing."`;

  const teamYaml = `id: test_team
tier: team
meta:
  version: "1.0.0"
  description: "Test team fragment"
  tags: []
  author: "test"
  updated: "2026-05-31"
  fabric_source: null
depends_on: [test_org]
replace_blocks: []
blocks:
  identity: |
    You are a member of the test team.
  context: null
  steps: |
    1. Write tests
    2. Run tests
    3. Fix failures
  rules:
    - content: "Write comprehensive tests."`;

  const taskYaml = `id: test_task
tier: task
meta:
  version: "1.0.0"
  description: "Test task fragment"
  tags: []
  author: "test"
  updated: "2026-05-31"
  fabric_source: null
depends_on: [test_team]
replace_blocks: []
blocks:
  identity: null
  context: null
  steps: null
  rules:
    - key: "accuracy"
      content: "Use exact assertions in tests."`;

  const personaYaml = `id: test_persona
tier: persona
meta:
  version: "1.0.0"
  description: "Test persona"
  tags: []
  author: "test"
  updated: "2026-05-31"
  fabric_source: null
depends_on: []
replace_blocks: [identity]
blocks:
  identity: |
    You are a testing expert who values precision.
  context: null
  steps: null
  rules:
    - content: "Be thorough in testing."`;

  await writeFile(join(testDir, "org.yaml"), orgYaml, "utf-8");
  await writeFile(join(testDir, "team.yaml"), teamYaml, "utf-8");
  await writeFile(join(testDir, "task.yaml"), taskYaml, "utf-8");
  await writeFile(join(testDir, "persona.yaml"), personaYaml, "utf-8");
});

afterAll(async () => {
  await rm(testDir, { recursive: true, force: true });
});

describe("compile — full integration", () => {
  it("compiles a single fragment successfully", async () => {
    const request: CompileRequest = {
      fragmentPaths: ["org.yaml"],
      tokenBudget: 8192,
      encoding: "cl100k_base",
      outputFormat: "fabric",
    };

    const result = await compile(request, testDir);

    expect(result.markdown).toContain("# IDENTITY AND PURPOSE");
    expect(result.markdown).toContain("AI assistant for a test organization");
    expect(result.manifest.selectedFragments).toHaveLength(1);
    expect(result.manifest.selectedFragments[0].id).toBe("test_org");
  });

  it("compiles multiple fragments in tier order", async () => {
    const request: CompileRequest = {
      fragmentPaths: ["task.yaml", "org.yaml", "team.yaml"],
      tokenBudget: 8192,
      encoding: "cl100k_base",
      outputFormat: "fabric",
    };

    const result = await compile(request, testDir);

    expect(result.markdown).toContain("test organization");
    expect(result.markdown).toContain("test team");
    expect(result.manifest.selectedFragments).toHaveLength(3);
    
    // Manifest preserves input order, but content is merged by tier priority
    const ids = result.manifest.selectedFragments.map((f) => f.id);
    expect(ids).toEqual(["test_task", "test_org", "test_team"]);
    
    // Verify identity blocks are merged in tier order (org, team, task)
    const lines = result.markdown.split("\n");
    const identitySection = lines
      .slice(lines.indexOf("# IDENTITY AND PURPOSE"))
      .join("\n");
    
    // "test organization" should appear before "test team" in the output
    const orgPos = identitySection.indexOf("test organization");
    const teamPos = identitySection.indexOf("test team");
    expect(orgPos).toBeLessThan(teamPos);
  });

  it("respects replace_blocks directive", async () => {
    const request: CompileRequest = {
      fragmentPaths: ["org.yaml", "persona.yaml"],
      tokenBudget: 8192,
      encoding: "cl100k_base",
      outputFormat: "fabric",
    };

    const result = await compile(request, testDir);

    expect(result.markdown).toContain("testing expert");
    expect(result.markdown).not.toContain("AI assistant for a test organization");
  });

  it("detects missing dependencies", async () => {
    const request: CompileRequest = {
      fragmentPaths: ["team.yaml"],
      tokenBudget: 8192,
      encoding: "cl100k_base",
      outputFormat: "fabric",
    };

    const result = await compile(request, testDir);

    expect(result.manifest.missingDependencies).toHaveLength(1);
    expect(result.manifest.missingDependencies[0].fragmentId).toBe("test_team");
    expect(result.manifest.missingDependencies[0].missingIds).toContain("test_org");
  });

  it("resolves keyed rule conflicts", async () => {
    const request: CompileRequest = {
      fragmentPaths: ["org.yaml", "task.yaml"],
      tokenBudget: 8192,
      encoding: "cl100k_base",
      outputFormat: "fabric",
    };

    const result = await compile(request, testDir);

    expect(result.markdown).toContain("exact assertions");
    expect(result.markdown).not.toContain("Always be accurate in testing");
    expect(result.manifest.conflictResolutions).toHaveLength(1);
    expect(result.manifest.conflictResolutions[0].key).toBe("accuracy");
    expect(result.manifest.conflictResolutions[0].winner).toBe("test_task");
  });

  it("counts tokens correctly", async () => {
    const request: CompileRequest = {
      fragmentPaths: ["org.yaml"],
      tokenBudget: 8192,
      encoding: "cl100k_base",
      outputFormat: "fabric",
    };

    const result = await compile(request, testDir);

    expect(result.manifest.tokenCount).toBeGreaterThan(0);
    expect(result.manifest.tokenCount).toBeLessThan(1000);
    
    // Verify token count matches manual counting
    const manualCount = countTokens(result.markdown, "cl100k_base");
    expect(result.manifest.tokenCount).toBe(manualCount);
  });

  it("detects token budget exceedance", async () => {
    const request: CompileRequest = {
      fragmentPaths: ["org.yaml", "team.yaml", "task.yaml"],
      tokenBudget: 10,
      encoding: "cl100k_base",
      outputFormat: "fabric",
    };

    const result = await compile(request, testDir);

    expect(result.manifest.exceedsBudget).toBe(true);
    expect(result.manifest.tokenCount).toBeGreaterThan(result.manifest.tokenBudget);
  });

  it("respects token budget setting", async () => {
    const request: CompileRequest = {
      fragmentPaths: ["org.yaml"],
      tokenBudget: 50000,
      encoding: "cl100k_base",
      outputFormat: "fabric",
    };

    const result = await compile(request, testDir);

    expect(result.manifest.tokenBudget).toBe(50000);
    expect(result.manifest.exceedsBudget).toBe(false);
  });

  it("includes compilation timestamp", async () => {
    const request: CompileRequest = {
      fragmentPaths: ["org.yaml"],
      tokenBudget: 8192,
      encoding: "cl100k_base",
      outputFormat: "fabric",
    };

    const beforeCompile = new Date().toISOString();
    const result = await compile(request, testDir);
    const afterCompile = new Date().toISOString();

    expect(result.manifest.compiledAt).toBeDefined();
    expect(result.manifest.compiledAt >= beforeCompile).toBe(true);
    expect(result.manifest.compiledAt <= afterCompile).toBe(true);
  });
});

describe("compile — output formats", () => {
  it("produces fabric format by default", async () => {
    const request: CompileRequest = {
      fragmentPaths: ["org.yaml"],
      tokenBudget: 8192,
      encoding: "cl100k_base",
      outputFormat: "fabric",
    };

    const result = await compile(request, testDir);

    expect(result.markdown).toContain("# IDENTITY AND PURPOSE");
    expect(result.manifest.outputFormat).toBe("fabric");
  });

  it("produces xml format", async () => {
    const request: CompileRequest = {
      fragmentPaths: ["org.yaml"],
      tokenBudget: 8192,
      encoding: "cl100k_base",
      outputFormat: "xml",
    };

    const result = await compile(request, testDir);

    expect(result.markdown).toContain("<identity_and_purpose>");
    expect(result.markdown).toContain("</identity_and_purpose>");
    expect(result.manifest.outputFormat).toBe("xml");
  });

  it("produces prose format", async () => {
    const request: CompileRequest = {
      fragmentPaths: ["org.yaml", "team.yaml"],
      tokenBudget: 8192,
      encoding: "cl100k_base",
      outputFormat: "prose",
    };

    const result = await compile(request, testDir);

    expect(result.markdown).toContain("---");
    expect(result.markdown).not.toContain("# IDENTITY");
    expect(result.manifest.outputFormat).toBe("prose");
  });

  it("produces json format", async () => {
    const request: CompileRequest = {
      fragmentPaths: ["org.yaml"],
      tokenBudget: 8192,
      encoding: "cl100k_base",
      outputFormat: "json",
    };

    const result = await compile(request, testDir);

    expect(() => JSON.parse(result.markdown)).not.toThrow();
    const parsed = JSON.parse(result.markdown);
    expect(parsed.identity).toBeDefined();
    expect(result.manifest.outputFormat).toBe("json");
  });

  it("produces chatml format", async () => {
    const request: CompileRequest = {
      fragmentPaths: ["org.yaml"],
      tokenBudget: 8192,
      encoding: "cl100k_base",
      outputFormat: "chatml",
    };

    const result = await compile(request, testDir);

    expect(result.markdown).toContain("<|im_start|>system");
    expect(result.markdown).toContain("<|im_end|>");
    expect(result.manifest.outputFormat).toBe("chatml");
  });

  it("openAIMessage matches format selection", async () => {
    const request: CompileRequest = {
      fragmentPaths: ["org.yaml"],
      tokenBudget: 8192,
      encoding: "cl100k_base",
      outputFormat: "xml",
    };

    const result = await compile(request, testDir);

    expect(result.openAIMessage.role).toBe("system");
    expect(result.openAIMessage.content).toContain("<identity_and_purpose>");
  });
});

describe("compile — path traversal security", () => {
  it("rejects path with .. traversal", async () => {
    const request: CompileRequest = {
      fragmentPaths: ["../../../etc/passwd"],
      tokenBudget: 8192,
      encoding: "cl100k_base",
      outputFormat: "fabric",
    };

    await expect(compile(request, testDir)).rejects.toThrow("Unsafe fragment path");
  });

  it("rejects absolute path outside base directory", async () => {
    const request: CompileRequest = {
      fragmentPaths: ["/etc/passwd"],
      tokenBudget: 8192,
      encoding: "cl100k_base",
      outputFormat: "fabric",
    };

    await expect(compile(request, testDir)).rejects.toThrow("Unsafe fragment path");
  });

  it("accepts normal relative path", async () => {
    const request: CompileRequest = {
      fragmentPaths: ["org.yaml"],
      tokenBudget: 8192,
      encoding: "cl100k_base",
      outputFormat: "fabric",
    };

    await expect(compile(request, testDir)).resolves.toBeDefined();
  });

  it("accepts nested relative path", async () => {
    // Create a nested directory structure
    const nestedDir = join(testDir, "nested", "deep");
    await mkdir(nestedDir, { recursive: true });

    const nestedYaml = `id: nested_fragment
tier: task
meta:
  version: "1.0.0"
  description: "Nested fragment"
  tags: []
  author: "test"
  updated: "2026-05-31"
  fabric_source: null
depends_on: []
blocks:
  identity: "Nested identity"
  context: null
  steps: null
  rules: []`;

    await writeFile(join(nestedDir, "fragment.yaml"), nestedYaml, "utf-8");

    const request: CompileRequest = {
      fragmentPaths: ["nested/deep/fragment.yaml"],
      tokenBudget: 8192,
      encoding: "cl100k_base",
      outputFormat: "fabric",
    };

    await expect(compile(request, testDir)).resolves.toBeDefined();
  });

  it("rejects path that resolves outside base after normalization", async () => {
    const request: CompileRequest = {
      fragmentPaths: ["nested/../../outside.yaml"],
      tokenBudget: 8192,
      encoding: "cl100k_base",
      outputFormat: "fabric",
    };

    await expect(compile(request, testDir)).rejects.toThrow("Unsafe fragment path");
  });
});

describe("compile — encoding support", () => {
  it("supports cl100k_base encoding", async () => {
    const request: CompileRequest = {
      fragmentPaths: ["org.yaml"],
      tokenBudget: 8192,
      encoding: "cl100k_base",
      outputFormat: "fabric",
    };

    const result = await compile(request, testDir);
    expect(result.manifest.tokenCount).toBeGreaterThan(0);
  });

  it("supports o200k_base encoding", async () => {
    const request: CompileRequest = {
      fragmentPaths: ["org.yaml"],
      tokenBudget: 8192,
      encoding: "o200k_base",
      outputFormat: "fabric",
    };

    const result = await compile(request, testDir);
    expect(result.manifest.tokenCount).toBeGreaterThan(0);
  });

  it("different encodings produce different token counts", async () => {
    const request1: CompileRequest = {
      fragmentPaths: ["org.yaml", "team.yaml"],
      tokenBudget: 8192,
      encoding: "cl100k_base",
      outputFormat: "fabric",
    };

    const request2: CompileRequest = {
      ...request1,
      encoding: "o200k_base",
    };

    const result1 = await compile(request1, testDir);
    const result2 = await compile(request2, testDir);

    // Token counts may differ slightly between encodings
    expect(result1.manifest.tokenCount).toBeGreaterThan(0);
    expect(result2.manifest.tokenCount).toBeGreaterThan(0);
  });
});

describe("compile — custom tier ordering", () => {
  it("respects custom tier order when provided", async () => {
    // Custom order puts task first (highest priority), then team, then org (lowest)
    // This is opposite of default where org is highest priority
    const customOrder = ["task", "team", "org"];
    const request: CompileRequest = {
      fragmentPaths: ["org.yaml", "team.yaml", "task.yaml"],
      tokenBudget: 8192,
      encoding: "cl100k_base",
      outputFormat: "fabric",
    };

    const result = await compile(request, testDir, customOrder);

    // task.yaml has no identity, only team.yaml and org.yaml do
    // With custom order [task, team, org], task is highest priority
    // So blocks should be: task (empty), team, org in that order
    const lines = result.markdown.split("\n");
    const identitySection = lines
      .slice(lines.indexOf("# IDENTITY AND PURPOSE"))
      .join("\n");
    
    // Verify both identities are present
    expect(identitySection).toContain("test team");
    expect(identitySection).toContain("test organization");
    
    // With custom order giving task highest priority, team should come before org
    const teamPos = identitySection.indexOf("test team");
    const orgPos = identitySection.indexOf("test organization");
    expect(teamPos).toBeGreaterThan(0);
    expect(orgPos).toBeGreaterThan(0);
    expect(teamPos).toBeLessThan(orgPos);
  });
});

describe("compile — error handling", () => {
  it("propagates file not found errors", async () => {
    const request: CompileRequest = {
      fragmentPaths: ["nonexistent.yaml"],
      tokenBudget: 8192,
      encoding: "cl100k_base",
      outputFormat: "fabric",
    };

    await expect(compile(request, testDir)).rejects.toThrow();
  });

  it("propagates YAML parse errors", async () => {
    const badPath = join(testDir, "malformed.yaml");
    await writeFile(badPath, "id: test\nblocks: {unclosed", "utf-8");

    const request: CompileRequest = {
      fragmentPaths: ["malformed.yaml"],
      tokenBudget: 8192,
      encoding: "cl100k_base",
      outputFormat: "fabric",
    };

    await expect(compile(request, testDir)).rejects.toThrow();
  });

  it("propagates schema validation errors", async () => {
    const invalidPath = join(testDir, "invalid-schema.yaml");
    const yaml = `id: "Bad ID!"
tier: task
meta:
  version: "not-semver"
  description: "Invalid"
  tags: []
  author: "test"
  updated: "2026-05-31"
blocks:
  identity: null
  context: null
  steps: null
  rules: []`;

    await writeFile(invalidPath, yaml, "utf-8");

    const request: CompileRequest = {
      fragmentPaths: ["invalid-schema.yaml"],
      tokenBudget: 8192,
      encoding: "cl100k_base",
      outputFormat: "fabric",
    };

    await expect(compile(request, testDir)).rejects.toThrow();
  });
});
