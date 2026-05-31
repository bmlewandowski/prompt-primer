import { describe, it, expect } from "vitest";
import { lintFragments } from "../src/linter.js";
import type { Fragment, LintWarning } from "../src/linter.js";

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

describe("lintFragments — identity clarity", () => {
  it("warns when identity contains multiple vague words", () => {
    const fragment = makeFragment({
      id: "test",
      tier: "task",
      blocks: {
        identity: "You help assist and support users with various things and provide general stuff.",
      },
    });

    const warnings = lintFragments([fragment]);
    const vaguenessWarning = warnings.find(
      (w) => w.category === "identity" && w.message.includes("vague words")
    );

    expect(vaguenessWarning).toBeDefined();
    expect(vaguenessWarning?.severity).toBe("warning");
    expect(vaguenessWarning?.fragmentId).toBe("test");
  });

  it("does not warn for specific, concrete identity", () => {
    const fragment = makeFragment({
      id: "test",
      tier: "task",
      blocks: {
        identity: "You are an expert TypeScript developer specializing in React applications with 10+ years of experience.",
      },
    });

    const warnings = lintFragments([fragment]);
    const vaguenessWarning = warnings.find(
      (w) => w.category === "identity" && w.message.includes("vague")
    );

    expect(vaguenessWarning).toBeUndefined();
  });

  it("warns when identity is too short", () => {
    const fragment = makeFragment({
      id: "test",
      tier: "task",
      blocks: {
        identity: "You help users.",
      },
    });

    const warnings = lintFragments([fragment]);
    const shortWarning = warnings.find(
      (w) => w.category === "identity" && w.message.includes("very short")
    );

    expect(shortWarning).toBeDefined();
    expect(shortWarning?.severity).toBe("warning");
  });

  it("does not warn for sufficiently detailed identity", () => {
    const fragment = makeFragment({
      id: "test",
      tier: "task",
      blocks: {
        identity: "You are a senior software engineer with expertise in distributed systems.",
      },
    });

    const warnings = lintFragments([fragment]);
    const shortWarning = warnings.find(
      (w) => w.category === "identity" && w.message.includes("short")
    );

    expect(shortWarning).toBeUndefined();
  });

  it("suggests Telos framing for context-heavy fragments without current/ideal state", () => {
    const fragment = makeFragment({
      id: "test",
      tier: "org",
      blocks: {
        identity: "You are a platform engineer.",
        context: "We are building a platform. " + "The system needs improvement. ".repeat(20),
      },
    });

    const warnings = lintFragments([fragment]);
    const telosWarning = warnings.find(
      (w) => w.category === "identity" && w.message.includes("current state")
    );

    expect(telosWarning).toBeDefined();
    expect(telosWarning?.severity).toBe("info");
    expect(telosWarning?.suggestion).toContain("Telos");
  });

  it("does not suggest Telos framing when context includes current/ideal state", () => {
    const fragment = makeFragment({
      id: "test",
      tier: "org",
      blocks: {
        context:
          "Current state: We are running legacy systems. " +
          "Ideal state: We want a modern, cloud-native architecture. " +
          "This requires a careful migration strategy.",
      },
    });

    const warnings = lintFragments([fragment]);
    const telosWarning = warnings.find(
      (w) => w.category === "identity" && w.message.includes("Telos")
    );

    expect(telosWarning).toBeUndefined();
  });

  it("does not warn about short context blocks", () => {
    const fragment = makeFragment({
      id: "test",
      tier: "task",
      blocks: {
        context: "Production environment.",
      },
    });

    const warnings = lintFragments([fragment]);
    const telosWarning = warnings.find(
      (w) => w.message.includes("Telos") || w.message.includes("current state")
    );

    expect(telosWarning).toBeUndefined();
  });
});

describe("lintFragments — rule length and count", () => {
  it("warns when a single rule exceeds 200 words", () => {
    const longRule = "word ".repeat(250);
    const fragment = makeFragment({
      id: "test",
      tier: "task",
      blocks: {
        rules: [{ content: longRule }],
      },
    });

    const warnings = lintFragments([fragment]);
    const lengthWarning = warnings.find(
      (w) => w.category === "rules" && w.message.includes("very long")
    );

    expect(lengthWarning).toBeDefined();
    expect(lengthWarning?.severity).toBe("warning");
    expect(lengthWarning?.suggestion).toContain("Break long rules");
  });

  it("does not warn for rules under 200 words", () => {
    const fragment = makeFragment({
      id: "test",
      tier: "task",
      blocks: {
        rules: [
          { content: "Be concise and direct." },
          { content: "Avoid unnecessary explanations." },
        ],
      },
    });

    const warnings = lintFragments([fragment]);
    const lengthWarning = warnings.find(
      (w) => w.category === "rules" && w.message.includes("long")
    );

    expect(lengthWarning).toBeUndefined();
  });

  it("suggests splitting when fragment has more than 5 rules", () => {
    const fragment = makeFragment({
      id: "test",
      tier: "task",
      blocks: {
        rules: [
          { content: "Rule 1" },
          { content: "Rule 2" },
          { content: "Rule 3" },
          { content: "Rule 4" },
          { content: "Rule 5" },
          { content: "Rule 6" },
        ],
      },
    });

    const warnings = lintFragments([fragment]);
    const countWarning = warnings.find(
      (w) => w.category === "structure" && w.message.includes("6 rules")
    );

    expect(countWarning).toBeDefined();
    expect(countWarning?.severity).toBe("info");
    expect(countWarning?.suggestion).toContain("splitting");
  });

  it("does not warn for 5 or fewer rules", () => {
    const fragment = makeFragment({
      id: "test",
      tier: "task",
      blocks: {
        rules: [
          { content: "Rule 1" },
          { content: "Rule 2" },
          { content: "Rule 3" },
          { content: "Rule 4" },
          { content: "Rule 5" },
        ],
      },
    });

    const warnings = lintFragments([fragment]);
    const countWarning = warnings.find(
      (w) => w.category === "structure" && w.message.includes("rules")
    );

    expect(countWarning).toBeUndefined();
  });
});

describe("lintFragments — consistency", () => {
  it("detects contradictory 'always' vs 'never' rules", () => {
    const fragments = [
      makeFragment({
        id: "fragment_a",
        tier: "org",
        blocks: {
          rules: [{ content: "Always include examples." }],
        },
      }),
      makeFragment({
        id: "fragment_b",
        tier: "task",
        blocks: {
          rules: [{ content: "Never include examples." }],
        },
      }),
    ];

    const warnings = lintFragments(fragments);
    const contradiction = warnings.find(
      (w) => w.category === "consistency" && w.message.includes("contradiction")
    );

    expect(contradiction).toBeDefined();
    expect(contradiction?.severity).toBe("warning");
    expect(contradiction?.suggestion).toContain("always");
    expect(contradiction?.suggestion).toContain("never");
  });

  it("detects contradictory 'must' vs 'optional' rules", () => {
    const fragments = [
      makeFragment({
        id: "fragment_a",
        tier: "team",
        blocks: {
          rules: [{ content: "Documentation is required and must be complete." }],
        },
      }),
      makeFragment({
        id: "fragment_b",
        tier: "task",
        blocks: {
          rules: [{ content: "Documentation is optional for quick fixes." }],
        },
      }),
    ];

    const warnings = lintFragments(fragments);
    const contradiction = warnings.find(
      (w) => w.category === "consistency" && w.message.includes("contradiction")
    );

    expect(contradiction).toBeDefined();
  });

  it("detects contradictory 'verbose' vs 'concise' rules", () => {
    const fragments = [
      makeFragment({
        id: "fragment_a",
        tier: "persona",
        blocks: {
          rules: [{ content: "Be verbose and explain everything in detail." }],
        },
      }),
      makeFragment({
        id: "fragment_b",
        tier: "persona",
        blocks: {
          rules: [{ content: "Be concise and brief." }],
        },
      }),
    ];

    const warnings = lintFragments(fragments);
    const contradiction = warnings.find(
      (w) => w.category === "consistency" && w.message.includes("contradiction")
    );

    expect(contradiction).toBeDefined();
  });

  it("detects contradictory 'formal' vs 'casual' rules", () => {
    const fragments = [
      makeFragment({
        id: "fragment_a",
        tier: "persona",
        blocks: {
          rules: [{ content: "Use formal language." }],
        },
      }),
      makeFragment({
        id: "fragment_b",
        tier: "persona",
        blocks: {
          rules: [{ content: "Use casual language." }],
        },
      }),
    ];

    const warnings = lintFragments(fragments);
    const contradiction = warnings.find(
      (w) => w.category === "consistency" && w.message.includes("contradiction")
    );

    expect(contradiction).toBeDefined();
  });

  it("does not report contradictions within the same fragment", () => {
    const fragment = makeFragment({
      id: "test",
      tier: "task",
      blocks: {
        rules: [
          { content: "Always validate inputs." },
          { content: "Never trust user data." },
        ],
      },
    });

    const warnings = lintFragments([fragment]);
    const contradiction = warnings.find(
      (w) => w.category === "consistency" && w.message.includes("contradiction")
    );

    // These are complementary, not contradictory
    expect(contradiction).toBeUndefined();
  });

  it("reports keyed rule override as info", () => {
    const fragments = [
      makeFragment({
        id: "fragment_a",
        tier: "org",
        blocks: {
          rules: [{ key: "output_format", content: "Output as Markdown." }],
        },
      }),
      makeFragment({
        id: "fragment_b",
        tier: "task",
        blocks: {
          rules: [{ key: "output_format", content: "Output as JSON." }],
        },
      }),
    ];

    const warnings = lintFragments(fragments);
    const override = warnings.find(
      (w) => w.category === "consistency" && w.message.includes("overrides")
    );

    expect(override).toBeDefined();
    expect(override?.severity).toBe("info");
    expect(override?.fragmentId).toBe("fragment_b");
    expect(override?.suggestion).toContain("expected behavior");
  });

  it("does not report override when keyed rules have same content", () => {
    const fragments = [
      makeFragment({
        id: "fragment_a",
        tier: "org",
        blocks: {
          rules: [{ key: "hallucination", content: "Never hallucinate." }],
        },
      }),
      makeFragment({
        id: "fragment_b",
        tier: "task",
        blocks: {
          rules: [{ key: "hallucination", content: "Never hallucinate." }],
        },
      }),
    ];

    const warnings = lintFragments(fragments);
    const override = warnings.find(
      (w) => w.message.includes("overrides") && w.message.includes("hallucination")
    );

    expect(override).toBeUndefined();
  });
});

describe("lintFragments — sorting and integration", () => {
  it("sorts warnings by severity (error > warning > info)", () => {
    const fragments = [
      makeFragment({
        id: "info_fragment",
        tier: "task",
        blocks: {
          rules: [
            { content: "Rule 1" },
            { content: "Rule 2" },
            { content: "Rule 3" },
            { content: "Rule 4" },
            { content: "Rule 5" },
            { content: "Rule 6" },
          ],
        },
      }),
      makeFragment({
        id: "warning_fragment",
        tier: "task",
        blocks: {
          identity: "You help with stuff.",
        },
      }),
    ];

    const warnings = lintFragments(fragments);
    
    // Find severity positions
    const firstWarningIdx = warnings.findIndex((w) => w.severity === "warning");
    const firstInfoIdx = warnings.findIndex((w) => w.severity === "info");

    if (firstWarningIdx !== -1 && firstInfoIdx !== -1) {
      expect(firstWarningIdx).toBeLessThan(firstInfoIdx);
    }
  });

  it("returns empty array for fragments with no issues", () => {
    const fragment = makeFragment({
      id: "perfect",
      tier: "task",
      blocks: {
        identity: "You are a senior software engineer specializing in distributed systems and microservices architecture.",
        rules: [
          { content: "Follow SOLID principles." },
          { content: "Write comprehensive tests." },
        ],
      },
    });

    const warnings = lintFragments([fragment]);
    expect(warnings).toHaveLength(0);
  });

  it("handles fragments with no identity block", () => {
    const fragment = makeFragment({
      id: "test",
      tier: "task",
      blocks: {
        rules: [{ content: "Some rule." }],
      },
    });

    expect(() => lintFragments([fragment])).not.toThrow();
    const warnings = lintFragments([fragment]);
    
    // Should not crash, but may or may not have warnings
    expect(Array.isArray(warnings)).toBe(true);
  });

  it("handles fragments with no rules block", () => {
    const fragment = makeFragment({
      id: "test",
      tier: "task",
      blocks: {
        identity: "You are an expert.",
      },
    });

    expect(() => lintFragments([fragment])).not.toThrow();
  });

  it("handles empty fragment array", () => {
    const warnings = lintFragments([]);
    expect(warnings).toHaveLength(0);
  });

  it("accumulates warnings from multiple fragments", () => {
    const fragments = [
      makeFragment({
        id: "fragment_1",
        tier: "org",
        blocks: {
          identity: "You help.",
        },
      }),
      makeFragment({
        id: "fragment_2",
        tier: "task",
        blocks: {
          identity: "You assist.",
        },
      }),
    ];

    const warnings = lintFragments(fragments);
    
    // Both fragments have short identities
    const fragment1Warnings = warnings.filter((w) => w.fragmentId === "fragment_1");
    const fragment2Warnings = warnings.filter((w) => w.fragmentId === "fragment_2");

    expect(fragment1Warnings.length).toBeGreaterThan(0);
    expect(fragment2Warnings.length).toBeGreaterThan(0);
  });
});

describe("lintFragments — suggestion quality", () => {
  it("provides actionable suggestions for vague identity", () => {
    const fragment = makeFragment({
      id: "test",
      tier: "task",
      blocks: {
        identity: "You help assist and support with various things.",
      },
    });

    const warnings = lintFragments([fragment]);
    const vaguenessWarning = warnings.find((w) => w.message.includes("vague"));

    expect(vaguenessWarning?.suggestion).toBeDefined();
    expect(vaguenessWarning?.suggestion).toContain("specific");
  });

  it("provides actionable suggestions for short identity", () => {
    const fragment = makeFragment({
      id: "test",
      tier: "task",
      blocks: {
        identity: "You code.",
      },
    });

    const warnings = lintFragments([fragment]);
    const shortWarning = warnings.find((w) => w.message.includes("short"));

    expect(shortWarning?.suggestion).toBeDefined();
    expect(shortWarning?.suggestion?.length).toBeGreaterThan(20);
  });

  it("provides actionable suggestions for long rules", () => {
    const fragment = makeFragment({
      id: "test",
      tier: "task",
      blocks: {
        rules: [{ content: "word ".repeat(250) }],
      },
    });

    const warnings = lintFragments([fragment]);
    const lengthWarning = warnings.find((w) => w.message.includes("long"));

    expect(lengthWarning?.suggestion).toBeDefined();
    expect(lengthWarning?.suggestion).toContain("Break");
  });
});
