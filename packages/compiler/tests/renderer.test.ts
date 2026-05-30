import { describe, it, expect } from "vitest";
import { renderMarkdown, renderOpenAIMessage } from "../src/renderer.js";
import type { MergedBlocks } from "../src/merger.js";

const emptyBlocks: MergedBlocks = {
  identity: [],
  context: [],
  steps: [],
  rules: [],
};

describe("renderMarkdown", () => {
  it("emits only sections with content", () => {
    const blocks: MergedBlocks = {
      ...emptyBlocks,
      identity: ["You are an expert."],
      rules: ["No hallucination."],
    };
    const md = renderMarkdown(blocks);
    expect(md).toContain("# IDENTITY AND PURPOSE");
    expect(md).toContain("# OUTPUT INSTRUCTIONS");
    expect(md).not.toContain("# CONTEXT");
    expect(md).not.toContain("# STEPS");
  });

  it("maintains section order: identity → context → steps → rules", () => {
    const blocks: MergedBlocks = {
      identity: ["Identity"],
      context: ["Context"],
      steps: ["Steps"],
      rules: ["Rules"],
    };
    const md = renderMarkdown(blocks);
    const identityPos = md.indexOf("# IDENTITY AND PURPOSE");
    const contextPos = md.indexOf("# CONTEXT");
    const stepsPos = md.indexOf("# STEPS");
    const rulesPos = md.indexOf("# OUTPUT INSTRUCTIONS");

    expect(identityPos).toBeLessThan(contextPos);
    expect(contextPos).toBeLessThan(stepsPos);
    expect(stepsPos).toBeLessThan(rulesPos);
  });

  it("does not embed HTML comments or trace metadata", () => {
    const blocks: MergedBlocks = {
      ...emptyBlocks,
      identity: ["Clean identity text"],
    };
    const md = renderMarkdown(blocks);
    expect(md).not.toMatch(/<!--/);
    expect(md).not.toMatch(/Source:/);
  });
});

describe("renderOpenAIMessage", () => {
  it("returns role system with markdown content", () => {
    const blocks: MergedBlocks = {
      ...emptyBlocks,
      identity: ["Identity"],
    };
    const message = renderOpenAIMessage(blocks);
    expect(message.role).toBe("system");
    expect(message.content).toContain("# IDENTITY AND PURPOSE");
  });
});
