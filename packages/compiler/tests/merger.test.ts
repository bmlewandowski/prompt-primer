import { describe, it, expect } from "vitest";
import { mergeFragments } from "../src/merger.js";
import type { Fragment } from "../src/types.js";

const makeFragment = (
  overrides: Partial<Fragment> & { id: string; tier: Fragment["tier"] }
): Fragment => ({
  id: overrides.id,
  tier: overrides.tier,
  meta: {
    version: "1.0.0",
    description: "",
    tags: [],
    author: "test",
    updated: "2026-01-01",
    fabric_source: null,
  },
  depends_on: overrides.depends_on ?? [],
  replace_blocks: overrides.replace_blocks ?? [],
  blocks: {
    identity: null,
    context: null,
    steps: null,
    rules: [],
    ...overrides.blocks,
  },
});

describe("mergeFragments — additive blocks", () => {
  it("concatenates identity blocks in tier order (org first, task last)", () => {
    const fragments: Fragment[] = [
      makeFragment({
        id: "task_a",
        tier: "task",
        blocks: { identity: "Task identity" },
      }),
      makeFragment({
        id: "org_a",
        tier: "org",
        blocks: { identity: "Org identity" },
      }),
      makeFragment({
        id: "team_a",
        tier: "team",
        blocks: { identity: "Team identity" },
      }),
    ];

    const { blocks } = mergeFragments(fragments);
    expect(blocks.identity).toEqual(["Org identity", "Team identity", "Task identity"]);
  });

  it("skips null/empty additive blocks", () => {
    const fragments: Fragment[] = [
      makeFragment({ id: "org_a", tier: "org", blocks: { identity: "Org identity" } }),
      makeFragment({ id: "team_a", tier: "team", blocks: { identity: null } }),
    ];
    const { blocks } = mergeFragments(fragments);
    expect(blocks.identity).toHaveLength(1);
    expect(blocks.identity[0]).toBe("Org identity");
  });
});

describe("mergeFragments — rules override", () => {
  it("unnamed rules from all tiers are appended", () => {
    const fragments: Fragment[] = [
      makeFragment({
        id: "org_a",
        tier: "org",
        blocks: { rules: [{ content: "Org rule" }] },
      }),
      makeFragment({
        id: "team_a",
        tier: "team",
        blocks: { rules: [{ content: "Team rule" }] },
      }),
    ];

    const { blocks } = mergeFragments(fragments);
    expect(blocks.rules).toContain("Org rule");
    expect(blocks.rules).toContain("Team rule");
    expect(blocks.rules).toHaveLength(2);
  });

  it("keyed rule at task tier overrides matching key at team tier", () => {
    const fragments: Fragment[] = [
      makeFragment({
        id: "team_a",
        tier: "team",
        blocks: {
          rules: [{ key: "output_format", content: "Output Markdown" }],
        },
      }),
      makeFragment({
        id: "task_a",
        tier: "task",
        blocks: {
          rules: [{ key: "output_format", content: "Output JSON" }],
        },
      }),
    ];

    const { blocks, conflictResolutions } = mergeFragments(fragments);
    expect(blocks.rules).toContain("Output JSON");
    expect(blocks.rules).not.toContain("Output Markdown");
    expect(conflictResolutions).toHaveLength(1);
    expect(conflictResolutions[0].winner).toBe("task_a");
    expect(conflictResolutions[0].overrode).toContain("team_a");
  });

  it("project tier overrides team tier for same key", () => {
    const fragments: Fragment[] = [
      makeFragment({
        id: "team_a",
        tier: "team",
        blocks: { rules: [{ key: "lang", content: "Use Python" }] },
      }),
      makeFragment({
        id: "proj_a",
        tier: "project",
        blocks: { rules: [{ key: "lang", content: "Use JavaScript" }] },
      }),
    ];

    const { blocks } = mergeFragments(fragments);
    expect(blocks.rules).toContain("Use JavaScript");
    expect(blocks.rules).not.toContain("Use Python");
  });

  it("keyed and unnamed rules coexist correctly", () => {
    const fragments: Fragment[] = [
      makeFragment({
        id: "org_a",
        tier: "org",
        blocks: {
          rules: [
            { content: "No hallucination" },
            { key: "output_format", content: "Output Markdown" },
          ],
        },
      }),
      makeFragment({
        id: "task_a",
        tier: "task",
        blocks: {
          rules: [{ key: "output_format", content: "Output JSON" }],
        },
      }),
    ];

    const { blocks } = mergeFragments(fragments);
    expect(blocks.rules).toContain("No hallucination");
    expect(blocks.rules).toContain("Output JSON");
    expect(blocks.rules).not.toContain("Output Markdown");
  });
});

describe("mergeFragments — dependency validation", () => {
  it("reports missing depends_on fragments", () => {
    const fragments: Fragment[] = [
      makeFragment({
        id: "task_a",
        tier: "task",
        depends_on: ["proj_required"],
      }),
    ];

    const { missingDependencies } = mergeFragments(fragments);
    expect(missingDependencies).toHaveLength(1);
    expect(missingDependencies[0].fragmentId).toBe("task_a");
    expect(missingDependencies[0].missingIds).toContain("proj_required");
  });

  it("reports no missing dependencies when all are present", () => {
    const fragments: Fragment[] = [
      makeFragment({ id: "proj_a", tier: "project" }),
      makeFragment({ id: "task_a", tier: "task", depends_on: ["proj_a"] }),
    ];

    const { missingDependencies } = mergeFragments(fragments);
    expect(missingDependencies).toHaveLength(0);
  });

  it("reports multiple missing dependencies for a single fragment", () => {
    const fragments: Fragment[] = [
      makeFragment({
        id: "task_a",
        tier: "task",
        depends_on: ["missing_1", "missing_2", "missing_3"],
      }),
    ];

    const { missingDependencies } = mergeFragments(fragments);
    expect(missingDependencies).toHaveLength(1);
    expect(missingDependencies[0].missingIds).toHaveLength(3);
  });

  it("reports missing dependencies across multiple fragments", () => {
    const fragments: Fragment[] = [
      makeFragment({
        id: "task_a",
        tier: "task",
        depends_on: ["missing_a"],
      }),
      makeFragment({
        id: "task_b",
        tier: "task",
        depends_on: ["missing_b"],
      }),
    ];

    const { missingDependencies } = mergeFragments(fragments);
    expect(missingDependencies).toHaveLength(2);
  });
});

describe("mergeFragments — replace_blocks", () => {
  it("replaces identity block when specified", () => {
    const fragments: Fragment[] = [
      makeFragment({
        id: "org_a",
        tier: "org",
        blocks: { identity: "Org identity" },
      }),
      makeFragment({
        id: "team_a",
        tier: "team",
        blocks: { identity: "Team identity" },
      }),
      makeFragment({
        id: "task_a",
        tier: "task",
        replace_blocks: ["identity"],
        blocks: { identity: "Task identity only" },
      }),
    ];

    const { blocks } = mergeFragments(fragments);
    expect(blocks.identity).toEqual(["Task identity only"]);
    expect(blocks.identity).not.toContain("Org identity");
    expect(blocks.identity).not.toContain("Team identity");
  });

  it("replaces context block when specified", () => {
    const fragments: Fragment[] = [
      makeFragment({
        id: "org_a",
        tier: "org",
        blocks: { context: "Org context" },
      }),
      makeFragment({
        id: "task_a",
        tier: "task",
        replace_blocks: ["context"],
        blocks: { context: "Task context only" },
      }),
    ];

    const { blocks } = mergeFragments(fragments);
    expect(blocks.context).toEqual(["Task context only"]);
  });

  it("replaces steps block when specified", () => {
    const fragments: Fragment[] = [
      makeFragment({
        id: "org_a",
        tier: "org",
        blocks: { steps: "Org steps" },
      }),
      makeFragment({
        id: "task_a",
        tier: "task",
        replace_blocks: ["steps"],
        blocks: { steps: "Task steps only" },
      }),
    ];

    const { blocks } = mergeFragments(fragments);
    expect(blocks.steps).toEqual(["Task steps only"]);
  });

  it("replaces multiple blocks simultaneously", () => {
    const fragments: Fragment[] = [
      makeFragment({
        id: "org_a",
        tier: "org",
        blocks: {
          identity: "Org identity",
          context: "Org context",
          steps: "Org steps",
        },
      }),
      makeFragment({
        id: "task_a",
        tier: "task",
        replace_blocks: ["identity", "context", "steps"],
        blocks: {
          identity: "New identity",
          context: "New context",
          steps: "New steps",
        },
      }),
    ];

    const { blocks } = mergeFragments(fragments);
    expect(blocks.identity).toEqual(["New identity"]);
    expect(blocks.context).toEqual(["New context"]);
    expect(blocks.steps).toEqual(["New steps"]);
  });

  it("replace_blocks affects only specified blocks", () => {
    const fragments: Fragment[] = [
      makeFragment({
        id: "org_a",
        tier: "org",
        blocks: {
          identity: "Org identity",
          context: "Org context",
        },
      }),
      makeFragment({
        id: "task_a",
        tier: "task",
        replace_blocks: ["identity"],
        blocks: {
          identity: "New identity",
          context: "Task context",
        },
      }),
    ];

    const { blocks } = mergeFragments(fragments);
    expect(blocks.identity).toEqual(["New identity"]);
    expect(blocks.context).toEqual(["Org context", "Task context"]);
  });

  it("middle tier can replace, then task tier appends", () => {
    const fragments: Fragment[] = [
      makeFragment({
        id: "org_a",
        tier: "org",
        blocks: { identity: "Org identity" },
      }),
      makeFragment({
        id: "persona_a",
        tier: "persona",
        replace_blocks: ["identity"],
        blocks: { identity: "Persona identity" },
      }),
      makeFragment({
        id: "task_a",
        tier: "task",
        blocks: { identity: "Task identity" },
      }),
    ];

    const { blocks } = mergeFragments(fragments);
    expect(blocks.identity).toEqual(["Persona identity", "Task identity"]);
  });
});

describe("mergeFragments — circular dependencies", () => {
  it("detects simple two-node cycle", () => {
    const fragments: Fragment[] = [
      makeFragment({
        id: "frag_a",
        tier: "task",
        depends_on: ["frag_b"],
      }),
      makeFragment({
        id: "frag_b",
        tier: "task",
        depends_on: ["frag_a"],
      }),
    ];

    const { circularDependencies } = mergeFragments(fragments);
    expect(circularDependencies).toHaveLength(1);
    expect(circularDependencies[0].cycle).toHaveLength(2);
  });

  it("detects three-node cycle", () => {
    const fragments: Fragment[] = [
      makeFragment({
        id: "frag_a",
        tier: "task",
        depends_on: ["frag_b"],
      }),
      makeFragment({
        id: "frag_b",
        tier: "task",
        depends_on: ["frag_c"],
      }),
      makeFragment({
        id: "frag_c",
        tier: "task",
        depends_on: ["frag_a"],
      }),
    ];

    const { circularDependencies } = mergeFragments(fragments);
    expect(circularDependencies).toHaveLength(1);
    expect(circularDependencies[0].cycle).toHaveLength(3);
  });

  it("detects self-dependency", () => {
    const fragments: Fragment[] = [
      makeFragment({
        id: "self_ref",
        tier: "task",
        depends_on: ["self_ref"],
      }),
    ];

    const { circularDependencies } = mergeFragments(fragments);
    expect(circularDependencies.length).toBeGreaterThan(0);
  });

  it("ignores dependencies outside selected fragments", () => {
    const fragments: Fragment[] = [
      makeFragment({
        id: "frag_a",
        tier: "task",
        depends_on: ["external_dep"],
      }),
    ];

    const { circularDependencies } = mergeFragments(fragments);
    expect(circularDependencies).toHaveLength(0);
  });

  it("reports no cycles when none exist", () => {
    const fragments: Fragment[] = [
      makeFragment({
        id: "frag_a",
        tier: "org",
        depends_on: [],
      }),
      makeFragment({
        id: "frag_b",
        tier: "task",
        depends_on: ["frag_a"],
      }),
    ];

    const { circularDependencies } = mergeFragments(fragments);
    expect(circularDependencies).toHaveLength(0);
  });
});

describe("mergeFragments — rule deduplication", () => {
  it("deduplicates identical unnamed rules", () => {
    const fragments: Fragment[] = [
      makeFragment({
        id: "org_a",
        tier: "org",
        blocks: { rules: [{ content: "No hallucination" }] },
      }),
      makeFragment({
        id: "team_a",
        tier: "team",
        blocks: { rules: [{ content: "No hallucination" }] },
      }),
    ];

    const { blocks } = mergeFragments(fragments);
    expect(blocks.rules.filter((r) => r === "No hallucination")).toHaveLength(1);
  });

  it("preserves rules with different content", () => {
    const fragments: Fragment[] = [
      makeFragment({
        id: "org_a",
        tier: "org",
        blocks: { rules: [{ content: "Rule A" }] },
      }),
      makeFragment({
        id: "team_a",
        tier: "team",
        blocks: { rules: [{ content: "Rule B" }] },
      }),
    ];

    const { blocks } = mergeFragments(fragments);
    expect(blocks.rules).toContain("Rule A");
    expect(blocks.rules).toContain("Rule B");
    expect(blocks.rules).toHaveLength(2);
  });

  it("handles whitespace-only differences as different rules", () => {
    const fragments: Fragment[] = [
      makeFragment({
        id: "org_a",
        tier: "org",
        blocks: { rules: [{ content: "Rule text" }] },
      }),
      makeFragment({
        id: "team_a",
        tier: "team",
        blocks: { rules: [{ content: "Rule text " }] },
      }),
    ];

    const { blocks } = mergeFragments(fragments);
    // After trimming, they should be identical
    expect(blocks.rules.filter((r) => r === "Rule text")).toHaveLength(1);
  });
});

describe("mergeFragments — custom tier ordering", () => {
  it("respects custom tier order", () => {
    const customOrder = ["custom_top", "custom_bottom"];
    const fragments: Fragment[] = [
      makeFragment({
        id: "frag_bottom",
        tier: "custom_bottom",
        blocks: { identity: "Bottom identity" },
      }),
      makeFragment({
        id: "frag_top",
        tier: "custom_top",
        blocks: { identity: "Top identity" },
      }),
    ];

    const { blocks } = mergeFragments(fragments, customOrder);
    expect(blocks.identity).toEqual(["Top identity", "Bottom identity"]);
  });

  it("places unknown tiers after known tiers", () => {
    const customOrder = ["org", "task"];
    const fragments: Fragment[] = [
      makeFragment({
        id: "org_a",
        tier: "org",
        blocks: { identity: "Org" },
      }),
      makeFragment({
        id: "unknown_a",
        tier: "unknown_tier",
        blocks: { identity: "Unknown" },
      }),
      makeFragment({
        id: "task_a",
        tier: "task",
        blocks: { identity: "Task" },
      }),
    ];

    const { blocks } = mergeFragments(fragments, customOrder);
    expect(blocks.identity[0]).toBe("Org");
    expect(blocks.identity[1]).toBe("Task");
    expect(blocks.identity[2]).toBe("Unknown");
  });
});

describe("mergeFragments — edge cases", () => {
  it("handles empty fragment array", () => {
    const { blocks, conflictResolutions, missingDependencies, circularDependencies } =
      mergeFragments([]);

    expect(blocks.identity).toHaveLength(0);
    expect(blocks.context).toHaveLength(0);
    expect(blocks.steps).toHaveLength(0);
    expect(blocks.rules).toHaveLength(0);
    expect(conflictResolutions).toHaveLength(0);
    expect(missingDependencies).toHaveLength(0);
    expect(circularDependencies).toHaveLength(0);
  });

  it("handles single fragment", () => {
    const fragments: Fragment[] = [
      makeFragment({
        id: "solo",
        tier: "task",
        blocks: { identity: "Solo identity" },
      }),
    ];

    const { blocks } = mergeFragments(fragments);
    expect(blocks.identity).toEqual(["Solo identity"]);
  });

  it("handles fragments with all null blocks", () => {
    const fragments: Fragment[] = [
      makeFragment({
        id: "empty_a",
        tier: "org",
        blocks: {},
      }),
      makeFragment({
        id: "empty_b",
        tier: "task",
        blocks: {},
      }),
    ];

    const { blocks } = mergeFragments(fragments);
    expect(blocks.identity).toHaveLength(0);
    expect(blocks.context).toHaveLength(0);
    expect(blocks.steps).toHaveLength(0);
    expect(blocks.rules).toHaveLength(0);
  });

  it("trims whitespace from block content", () => {
    const fragments: Fragment[] = [
      makeFragment({
        id: "whitespace",
        tier: "task",
        blocks: {
          identity: "  Identity with spaces  ",
          context: "\n\nContext with newlines\n\n",
        },
      }),
    ];

    const { blocks } = mergeFragments(fragments);
    expect(blocks.identity[0]).toBe("Identity with spaces");
    expect(blocks.context[0]).toBe("Context with newlines");
  });
});

describe("buildManifestFragments", () => {
  it("builds manifest entries from fragments and paths", async () => {
    const { buildManifestFragments } = await import("../src/merger.js");
    const fragments: Fragment[] = [
      makeFragment({
        id: "frag_a",
        tier: "org",
      }),
      makeFragment({
        id: "frag_b",
        tier: "task",
      }),
    ];
    const paths = ["org/frag_a.yaml", "task/frag_b.yaml"];

    const manifest = buildManifestFragments(fragments, paths);

    expect(manifest).toHaveLength(2);
    expect(manifest[0].id).toBe("frag_a");
    expect(manifest[0].tier).toBe("org");
    expect(manifest[0].version).toBe("1.0.0");
    expect(manifest[0].path).toBe("org/frag_a.yaml");
    expect(manifest[1].id).toBe("frag_b");
    expect(manifest[1].path).toBe("task/frag_b.yaml");
  });

  it("handles mismatched array lengths gracefully", async () => {
    const { buildManifestFragments } = await import("../src/merger.js");
    const fragments: Fragment[] = [
      makeFragment({
        id: "frag_a",
        tier: "org",
      }),
    ];
    const paths = ["org/frag_a.yaml", "extra/path.yaml"];

    const manifest = buildManifestFragments(fragments, paths);

    expect(manifest).toHaveLength(1);
    expect(manifest[0].path).toBe("org/frag_a.yaml");
  });

  it("uses empty string for missing paths", async () => {
    const { buildManifestFragments } = await import("../src/merger.js");
    const fragments: Fragment[] = [
      makeFragment({
        id: "frag_a",
        tier: "org",
      }),
      makeFragment({
        id: "frag_b",
        tier: "task",
      }),
    ];
    const paths = ["org/frag_a.yaml"];

    const manifest = buildManifestFragments(fragments, paths);

    expect(manifest).toHaveLength(2);
    expect(manifest[1].path).toBe("");
  });
});
