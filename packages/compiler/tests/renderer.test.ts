import { describe, it, expect } from "vitest";
import {
  renderMarkdown,
  renderXml,
  renderProse,
  renderJson,
  renderChatML,
  renderWithFormat,
  renderOpenAIMessage,
} from "../src/renderer.js";
import type { MergedBlocks } from "../src/merger.js";

const emptyBlocks: MergedBlocks = {
  identity: [],
  context: [],
  steps: [],
  rules: [],
};

const fullBlocks: MergedBlocks = {
  identity: ["You are an expert assistant."],
  context: ["Working in a production environment."],
  steps: ["1. Analyze the request\n2. Provide a solution"],
  rules: ["Be accurate.", "Be concise."],
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

  it("handles empty blocks gracefully", () => {
    const md = renderMarkdown(emptyBlocks);
    expect(md).toBe("");
  });

  it("concatenates multiple entries with blank lines", () => {
    const blocks: MergedBlocks = {
      ...emptyBlocks,
      identity: ["First identity", "Second identity"],
      rules: ["First rule", "Second rule"],
    };
    const md = renderMarkdown(blocks);
    expect(md).toContain("First identity\n\nSecond identity");
    expect(md).toContain("First rule\n\nSecond rule");
  });

  it("escapes user-authored header injection", () => {
    const blocks: MergedBlocks = {
      ...emptyBlocks,
      identity: ["# This should not be a header"],
    };
    const md = renderMarkdown(blocks);
    expect(md).toContain("\\# This should not be a header");
  });

  it("renders all blocks when all have content", () => {
    const md = renderMarkdown(fullBlocks);
    expect(md).toContain("# IDENTITY AND PURPOSE");
    expect(md).toContain("# CONTEXT");
    expect(md).toContain("# STEPS");
    expect(md).toContain("# OUTPUT INSTRUCTIONS");
  });
});

describe("renderXml", () => {
  it("wraps sections in XML tags", () => {
    const xml = renderXml(fullBlocks);
    expect(xml).toContain("<identity_and_purpose>");
    expect(xml).toContain("</identity_and_purpose>");
    expect(xml).toContain("<context>");
    expect(xml).toContain("</context>");
    expect(xml).toContain("<steps>");
    expect(xml).toContain("</steps>");
    expect(xml).toContain("<output_instructions>");
    expect(xml).toContain("</output_instructions>");
  });

  it("omits sections with no content", () => {
    const blocks: MergedBlocks = {
      ...emptyBlocks,
      identity: ["Identity only"],
    };
    const xml = renderXml(blocks);
    expect(xml).toContain("<identity_and_purpose>");
    expect(xml).not.toContain("<context>");
    expect(xml).not.toContain("<steps>");
    expect(xml).not.toContain("<output_instructions>");
  });

  it("handles empty blocks", () => {
    const xml = renderXml(emptyBlocks);
    expect(xml).toBe("");
  });

  it("maintains section order", () => {
    const xml = renderXml(fullBlocks);
    const identityPos = xml.indexOf("<identity_and_purpose>");
    const contextPos = xml.indexOf("<context>");
    const stepsPos = xml.indexOf("<steps>");
    const rulesPos = xml.indexOf("<output_instructions>");

    expect(identityPos).toBeLessThan(contextPos);
    expect(contextPos).toBeLessThan(stepsPos);
    expect(stepsPos).toBeLessThan(rulesPos);
  });

  it("concatenates multiple entries within tags", () => {
    const blocks: MergedBlocks = {
      ...emptyBlocks,
      identity: ["Part 1", "Part 2"],
    };
    const xml = renderXml(blocks);
    expect(xml).toContain("Part 1\n\nPart 2");
  });
});

describe("renderProse", () => {
  it("joins sections with triple-dash separators", () => {
    const prose = renderProse(fullBlocks);
    expect(prose).toContain("---");
  });

  it("omits section headers", () => {
    const prose = renderProse(fullBlocks);
    expect(prose).not.toContain("#");
    expect(prose).not.toContain("IDENTITY");
    expect(prose).not.toContain("CONTEXT");
  });

  it("maintains section order", () => {
    const blocks: MergedBlocks = {
      identity: ["Identity text"],
      context: ["Context text"],
      steps: ["Steps text"],
      rules: ["Rules text"],
    };
    const prose = renderProse(blocks);
    
    const identityPos = prose.indexOf("Identity text");
    const contextPos = prose.indexOf("Context text");
    const stepsPos = prose.indexOf("Steps text");
    const rulesPos = prose.indexOf("Rules text");

    expect(identityPos).toBeLessThan(contextPos);
    expect(contextPos).toBeLessThan(stepsPos);
    expect(stepsPos).toBeLessThan(rulesPos);
  });

  it("handles empty blocks", () => {
    const prose = renderProse(emptyBlocks);
    expect(prose).toBe("");
  });

  it("handles single section without separator", () => {
    const blocks: MergedBlocks = {
      ...emptyBlocks,
      identity: ["Only identity"],
    };
    const prose = renderProse(blocks);
    expect(prose).toBe("Only identity");
    expect(prose).not.toContain("---");
  });

  it("concatenates multiple entries within sections", () => {
    const blocks: MergedBlocks = {
      ...emptyBlocks,
      identity: ["First", "Second"],
      rules: ["Rule 1", "Rule 2"],
    };
    const prose = renderProse(blocks);
    expect(prose).toContain("First\n\nSecond");
    expect(prose).toContain("Rule 1\n\nRule 2");
  });
});

describe("renderJson", () => {
  it("produces valid JSON", () => {
    const json = renderJson(fullBlocks);
    expect(() => JSON.parse(json)).not.toThrow();
  });

  it("includes all non-empty blocks", () => {
    const json = renderJson(fullBlocks);
    const obj = JSON.parse(json);
    
    expect(obj.identity).toBeDefined();
    expect(obj.context).toBeDefined();
    expect(obj.steps).toBeDefined();
    expect(obj.rules).toBeDefined();
  });

  it("omits empty blocks", () => {
    const blocks: MergedBlocks = {
      ...emptyBlocks,
      identity: ["Identity only"],
    };
    const json = renderJson(blocks);
    const obj = JSON.parse(json);
    
    expect(obj.identity).toBeDefined();
    expect(obj.context).toBeUndefined();
    expect(obj.steps).toBeUndefined();
    expect(obj.rules).toBeUndefined();
  });

  it("joins multiple entries into single strings", () => {
    const blocks: MergedBlocks = {
      ...emptyBlocks,
      identity: ["Part 1", "Part 2"],
    };
    const json = renderJson(blocks);
    const obj = JSON.parse(json);
    
    expect(obj.identity).toBe("Part 1\n\nPart 2");
  });

  it("keeps rules as array", () => {
    const json = renderJson(fullBlocks);
    const obj = JSON.parse(json);
    
    expect(Array.isArray(obj.rules)).toBe(true);
    expect(obj.rules).toContain("Be accurate.");
    expect(obj.rules).toContain("Be concise.");
  });

  it("handles empty blocks", () => {
    const json = renderJson(emptyBlocks);
    const obj = JSON.parse(json);
    
    expect(Object.keys(obj)).toHaveLength(0);
  });

  it("pretty-prints with indentation", () => {
    const json = renderJson(fullBlocks);
    expect(json).toContain("\n  ");
  });
});

describe("renderChatML", () => {
  it("wraps content in ChatML system tags", () => {
    const chatml = renderChatML(fullBlocks);
    expect(chatml).toMatch(/^<\|im_start\|>system\n/);
    expect(chatml).toMatch(/<\|im_end\|>$/);
  });

  it("uses prose format for content", () => {
    const blocks: MergedBlocks = {
      ...emptyBlocks,
      identity: ["Identity"],
      rules: ["Rules"],
    };
    const chatml = renderChatML(blocks);
    
    // Should contain content but no markdown headers
    expect(chatml).toContain("Identity");
    expect(chatml).toContain("Rules");
    expect(chatml).not.toContain("# IDENTITY");
  });

  it("handles empty blocks", () => {
    const chatml = renderChatML(emptyBlocks);
    expect(chatml).toBe("<|im_start|>system\n<|im_end|>");
  });

  it("includes section separators from prose format", () => {
    const chatml = renderChatML(fullBlocks);
    expect(chatml).toContain("---");
  });
});

describe("renderWithFormat", () => {
  it("dispatches to renderMarkdown for 'fabric' format", () => {
    const result = renderWithFormat(fullBlocks, "fabric");
    expect(result).toContain("# IDENTITY AND PURPOSE");
  });

  it("dispatches to renderXml for 'xml' format", () => {
    const result = renderWithFormat(fullBlocks, "xml");
    expect(result).toContain("<identity_and_purpose>");
  });

  it("dispatches to renderProse for 'prose' format", () => {
    const result = renderWithFormat(fullBlocks, "prose");
    expect(result).toContain("---");
    expect(result).not.toContain("#");
  });

  it("dispatches to renderJson for 'json' format", () => {
    const result = renderWithFormat(fullBlocks, "json");
    expect(() => JSON.parse(result)).not.toThrow();
  });

  it("dispatches to renderChatML for 'chatml' format", () => {
    const result = renderWithFormat(fullBlocks, "chatml");
    expect(result).toContain("<|im_start|>system");
  });

  it("defaults to fabric format when no format specified", () => {
    const result = renderWithFormat(fullBlocks);
    expect(result).toContain("# IDENTITY AND PURPOSE");
  });

  it("handles all formats with empty blocks", () => {
    const formats: Array<"fabric" | "xml" | "prose" | "json" | "chatml"> = [
      "fabric", "xml", "prose", "json", "chatml"
    ];
    
    for (const format of formats) {
      expect(() => renderWithFormat(emptyBlocks, format)).not.toThrow();
    }
  });
});

describe("renderOpenAIMessage", () => {
  it("returns role system with markdown content by default", () => {
    const message = renderOpenAIMessage(fullBlocks);
    expect(message.role).toBe("system");
    expect(message.content).toContain("# IDENTITY AND PURPOSE");
  });

  it("respects format parameter for fabric", () => {
    const message = renderOpenAIMessage(fullBlocks, "fabric");
    expect(message.content).toContain("# IDENTITY AND PURPOSE");
  });

  it("respects format parameter for xml", () => {
    const message = renderOpenAIMessage(fullBlocks, "xml");
    expect(message.content).toContain("<identity_and_purpose>");
  });

  it("respects format parameter for prose", () => {
    const message = renderOpenAIMessage(fullBlocks, "prose");
    expect(message.content).toContain("---");
    expect(message.content).not.toContain("#");
  });

  it("respects format parameter for json", () => {
    const message = renderOpenAIMessage(fullBlocks, "json");
    expect(() => JSON.parse(message.content)).not.toThrow();
  });

  it("respects format parameter for chatml", () => {
    const message = renderOpenAIMessage(fullBlocks, "chatml");
    expect(message.content).toContain("<|im_start|>system");
  });

  it("always has role 'system'", () => {
    const formats: Array<"fabric" | "xml" | "prose" | "json" | "chatml"> = [
      "fabric", "xml", "prose", "json", "chatml"
    ];
    
    for (const format of formats) {
      const message = renderOpenAIMessage(fullBlocks, format);
      expect(message.role).toBe("system");
    }
  });

  it("handles empty blocks", () => {
    const message = renderOpenAIMessage(emptyBlocks);
    expect(message.role).toBe("system");
    expect(message.content).toBe("");
  });
});
