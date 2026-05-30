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
});
