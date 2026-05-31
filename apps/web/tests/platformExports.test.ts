import { describe, it, expect } from "vitest";
import {
  formatForChatGPT,
  formatForClaude,
  formatForCopilot,
  formatAsCurl,
  formatForVSCode,
} from "../lib/platformExports";
import type { CompileResult } from "../lib/types";

// Helper to create a mock CompileResult
const createMockResult = (overrides?: Partial<CompileResult>): CompileResult => ({
  markdown: "# IDENTITY AND PURPOSE\n\nYou are a helpful assistant.",
  openAIMessage: {
    role: "system",
    content: "# IDENTITY AND PURPOSE\n\nYou are a helpful assistant.",
  },
  manifest: {
    compiledAt: "2026-05-31T10:00:00.000Z",
    selectedFragments: [
      {
        id: "test_fragment",
        tier: "task",
        version: "1.0.0",
        path: "task/test.yaml",
      },
    ],
    tokenCount: 50,
    tokenBudget: 8192,
    exceedsBudget: false,
    conflictResolutions: [],
    missingDependencies: [],
    circularDependencies: [],
    outputFormat: "fabric",
  },
  ...overrides,
});

describe("formatForChatGPT", () => {
  it("returns content and filename", () => {
    const result = createMockResult();
    const export_ = formatForChatGPT(result);

    expect(export_.content).toBe(result.markdown);
    expect(export_.filename).toBe("chatgpt-instructions.txt");
  });

  it("does not warn for content under 1500 characters", () => {
    const result = createMockResult({
      markdown: "Short content",
    });
    const export_ = formatForChatGPT(result);

    expect(export_.warning).toBeUndefined();
  });

  it("warns when content exceeds 1500 characters", () => {
    const longContent = "x".repeat(1501);
    const result = createMockResult({
      markdown: longContent,
    });
    const export_ = formatForChatGPT(result);

    expect(export_.warning).toBeDefined();
    expect(export_.warning).toContain("1501 characters");
    expect(export_.warning).toContain("1500 characters");
  });

  it("includes character count in warning message", () => {
    const content = "x".repeat(2000);
    const result = createMockResult({
      markdown: content,
    });
    const export_ = formatForChatGPT(result);

    expect(export_.warning).toContain("2000");
  });

  it("handles exactly 1500 characters without warning", () => {
    const content = "x".repeat(1500);
    const result = createMockResult({
      markdown: content,
    });
    const export_ = formatForChatGPT(result);

    expect(export_.warning).toBeUndefined();
  });

  it("preserves markdown formatting", () => {
    const markdown = "# Header\n\n**Bold** and *italic*";
    const result = createMockResult({
      markdown,
    });
    const export_ = formatForChatGPT(result);

    expect(export_.content).toBe(markdown);
  });
});

describe("formatForClaude", () => {
  it("includes metadata header", () => {
    const result = createMockResult();
    const export_ = formatForClaude(result);

    expect(export_.content).toContain("# Project Context");
    expect(export_.content).toContain("Prompt Primer");
  });

  it("includes fragment count", () => {
    const result = createMockResult({
      manifest: {
        ...createMockResult().manifest,
        selectedFragments: [
          { id: "frag1", tier: "org", version: "1.0.0", path: "org/frag1.yaml" },
          { id: "frag2", tier: "task", version: "1.0.0", path: "task/frag2.yaml" },
          { id: "frag3", tier: "team", version: "1.0.0", path: "team/frag3.yaml" },
        ],
      },
    });
    const export_ = formatForClaude(result);

    expect(export_.content).toContain("3 fragments");
  });

  it("includes token count and budget", () => {
    const result = createMockResult({
      manifest: {
        ...createMockResult().manifest,
        tokenCount: 250,
        tokenBudget: 4096,
      },
    });
    const export_ = formatForClaude(result);

    expect(export_.content).toContain("250 / 4096");
  });

  it("includes original markdown content", () => {
    const markdown = "# IDENTITY\n\nTest content";
    const result = createMockResult({
      markdown,
    });
    const export_ = formatForClaude(result);

    expect(export_.content).toContain(markdown);
  });

  it("includes compilation timestamp", () => {
    const result = createMockResult({
      manifest: {
        ...createMockResult().manifest,
        compiledAt: "2026-05-31T15:30:00.000Z",
      },
    });
    const export_ = formatForClaude(result);

    expect(export_.content).toContain("2026-05-31T15:30:00.000Z");
  });

  it("includes output format", () => {
    const result = createMockResult({
      manifest: {
        ...createMockResult().manifest,
        outputFormat: "xml",
      },
    });
    const export_ = formatForClaude(result);

    expect(export_.content).toContain("xml");
  });

  it("returns correct filename", () => {
    const result = createMockResult();
    const export_ = formatForClaude(result);

    expect(export_.filename).toBe("claude-project-context.md");
  });

  it("never includes warning", () => {
    const result = createMockResult();
    const export_ = formatForClaude(result);

    expect(export_.warning).toBeUndefined();
  });
});

describe("formatForCopilot", () => {
  it("includes header", () => {
    const result = createMockResult();
    const export_ = formatForCopilot(result);

    expect(export_.content).toContain("# GitHub Copilot Instructions");
  });

  it("includes markdown content", () => {
    const markdown = "# IDENTITY\n\nCustom instructions";
    const result = createMockResult({
      markdown,
    });
    const export_ = formatForCopilot(result);

    expect(export_.content).toContain(markdown);
  });

  it("includes HTML comment with metadata", () => {
    const result = createMockResult();
    const export_ = formatForCopilot(result);

    expect(export_.content).toContain("<!--");
    expect(export_.content).toContain("Prompt Primer");
    expect(export_.content).toContain("-->");
  });

  it("lists fragment IDs in comment", () => {
    const result = createMockResult({
      manifest: {
        ...createMockResult().manifest,
        selectedFragments: [
          { id: "org_default", tier: "org", version: "1.0.0", path: "org/default.yaml" },
          { id: "task_review", tier: "task", version: "1.0.0", path: "task/review.yaml" },
        ],
      },
    });
    const export_ = formatForCopilot(result);

    expect(export_.content).toContain("org_default, task_review");
  });

  it("includes token count in comment", () => {
    const result = createMockResult({
      manifest: {
        ...createMockResult().manifest,
        tokenCount: 150,
      },
    });
    const export_ = formatForCopilot(result);

    expect(export_.content).toContain("Token count: 150");
  });

  it("includes compilation timestamp in comment", () => {
    const result = createMockResult({
      manifest: {
        ...createMockResult().manifest,
        compiledAt: "2026-05-31T12:00:00.000Z",
      },
    });
    const export_ = formatForCopilot(result);

    expect(export_.content).toContain("2026-05-31T12:00:00.000Z");
  });

  it("returns correct filename", () => {
    const result = createMockResult();
    const export_ = formatForCopilot(result);

    expect(export_.filename).toBe("copilot-instructions.md");
  });
});

describe("formatAsCurl", () => {
  it("generates valid bash script", () => {
    const result = createMockResult();
    const export_ = formatAsCurl(result);

    expect(export_.content).toContain("#!/bin/bash");
  });

  it("includes OpenAI API endpoint", () => {
    const result = createMockResult();
    const export_ = formatAsCurl(result);

    expect(export_.content).toContain("https://api.openai.com/v1/chat/completions");
  });

  it("includes authorization header placeholder", () => {
    const result = createMockResult();
    const export_ = formatAsCurl(result);

    expect(export_.content).toContain("Authorization: Bearer YOUR_API_KEY");
  });

  it("includes system message from openAIMessage", () => {
    const result = createMockResult({
      openAIMessage: {
        role: "system",
        content: "Custom system message",
      },
    });
    const export_ = formatAsCurl(result);

    expect(export_.content).toContain("Custom system message");
  });

  it("includes user message example", () => {
    const result = createMockResult();
    const export_ = formatAsCurl(result);

    expect(export_.content).toContain("Hello! I'm ready to work with you.");
  });

  it("includes model parameter", () => {
    const result = createMockResult();
    const export_ = formatAsCurl(result);

    expect(export_.content).toContain('"model": "gpt-4"');
  });

  it("includes temperature and max_tokens", () => {
    const result = createMockResult();
    const export_ = formatAsCurl(result);

    expect(export_.content).toContain('"temperature": 0.7');
    expect(export_.content).toContain('"max_tokens": 2000');
  });

  it("includes commented Anthropic example", () => {
    const result = createMockResult();
    const export_ = formatAsCurl(result);

    expect(export_.content).toContain("# Anthropic Claude API example");
    expect(export_.content).toContain("api.anthropic.com");
  });

  it("returns correct filename", () => {
    const result = createMockResult();
    const export_ = formatAsCurl(result);

    expect(export_.filename).toBe("api-example.sh");
  });

  it("properly escapes JSON in bash string", () => {
    const result = createMockResult({
      openAIMessage: {
        role: "system",
        content: 'Message with "quotes" and newlines\n',
      },
    });
    const export_ = formatAsCurl(result);

    // Should be valid JSON when extracted
    expect(export_.content).toContain('"role"');
    expect(export_.content).toContain('"system"');
  });
});

describe("formatForVSCode", () => {
  it("includes header", () => {
    const result = createMockResult();
    const export_ = formatForVSCode(result);

    expect(export_.content).toContain("# VS Code Instructions");
  });

  it("includes markdown content", () => {
    const markdown = "# IDENTITY\n\nVS Code instructions";
    const result = createMockResult({
      markdown,
    });
    const export_ = formatForVSCode(result);

    expect(export_.content).toContain(markdown);
  });

  it("includes metadata footer", () => {
    const result = createMockResult();
    const export_ = formatForVSCode(result);

    expect(export_.content).toContain("Auto-generated from Prompt Primer");
  });

  it("lists fragment IDs in footer", () => {
    const result = createMockResult({
      manifest: {
        ...createMockResult().manifest,
        selectedFragments: [
          { id: "org_config", tier: "org", version: "1.0.0", path: "org/config.yaml" },
          { id: "persona_dev", tier: "persona", version: "1.0.0", path: "persona/dev.yaml" },
        ],
      },
    });
    const export_ = formatForVSCode(result);

    expect(export_.content).toContain("org_config, persona_dev");
  });

  it("includes token count in footer", () => {
    const result = createMockResult({
      manifest: {
        ...createMockResult().manifest,
        tokenCount: 200,
      },
    });
    const export_ = formatForVSCode(result);

    expect(export_.content).toContain("Token count: 200");
  });

  it("returns correct filename", () => {
    const result = createMockResult();
    const export_ = formatForVSCode(result);

    expect(export_.filename).toBe(".instructions.md");
  });
});

describe("platform export edge cases", () => {
  it("handles empty markdown", () => {
    const result = createMockResult({
      markdown: "",
    });

    expect(() => formatForChatGPT(result)).not.toThrow();
    expect(() => formatForClaude(result)).not.toThrow();
    expect(() => formatForCopilot(result)).not.toThrow();
    expect(() => formatAsCurl(result)).not.toThrow();
    expect(() => formatForVSCode(result)).not.toThrow();
  });

  it("handles very long markdown", () => {
    const longMarkdown = "#".repeat(50000);
    const result = createMockResult({
      markdown: longMarkdown,
    });

    expect(() => formatForClaude(result)).not.toThrow();
    expect(() => formatForCopilot(result)).not.toThrow();
  });

  it("handles special characters in markdown", () => {
    const markdown = '# Test\n\n"Quotes" and \'apostrophes\' and `backticks`';
    const result = createMockResult({
      markdown,
    });

    const chatgpt = formatForChatGPT(result);
    const claude = formatForClaude(result);
    const copilot = formatForCopilot(result);

    expect(chatgpt.content).toContain(markdown);
    expect(claude.content).toContain(markdown);
    expect(copilot.content).toContain(markdown);
  });

  it("handles no selected fragments", () => {
    const result = createMockResult({
      manifest: {
        ...createMockResult().manifest,
        selectedFragments: [],
      },
    });

    expect(() => formatForClaude(result)).not.toThrow();
    expect(() => formatForCopilot(result)).not.toThrow();
    expect(() => formatForVSCode(result)).not.toThrow();
  });

  it("handles single fragment", () => {
    const result = createMockResult();

    const claude = formatForClaude(result);
    expect(claude.content).toContain("1 fragment");
  });

  it("handles large token counts", () => {
    const result = createMockResult({
      manifest: {
        ...createMockResult().manifest,
        tokenCount: 999999,
        tokenBudget: 1000000,
      },
    });

    expect(() => formatForClaude(result)).not.toThrow();
    expect(() => formatForCopilot(result)).not.toThrow();
  });
});
