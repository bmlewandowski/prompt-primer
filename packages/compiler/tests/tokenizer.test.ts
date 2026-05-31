import { describe, it, expect } from "vitest";
import { countTokens } from "../src/tokenizer.js";

describe("countTokens", () => {
  describe("basic token counting", () => {
    it("counts tokens in simple English text", () => {
      const text = "Hello, world!";
      const count = countTokens(text);
      expect(count).toBeGreaterThan(0);
      expect(count).toBeLessThan(10);
    });

    it("handles empty string", () => {
      const count = countTokens("");
      expect(count).toBe(0);
    });

    it("handles single character", () => {
      const count = countTokens("a");
      expect(count).toBe(1);
    });

    it("handles whitespace-only string", () => {
      const count = countTokens("   ");
      expect(count).toBeGreaterThan(0);
    });

    it("handles newlines", () => {
      const text = "Line 1\nLine 2\nLine 3";
      const count = countTokens(text);
      expect(count).toBeGreaterThan(3);
    });
  });

  describe("encoding selection", () => {
    it("uses cl100k_base encoding by default", () => {
      const text = "Hello, world!";
      const defaultCount = countTokens(text);
      const explicitCount = countTokens(text, "cl100k_base");
      expect(defaultCount).toBe(explicitCount);
    });

    it("supports o200k_base encoding", () => {
      const text = "Hello, world!";
      const count = countTokens(text, "o200k_base");
      expect(count).toBeGreaterThan(0);
    });

    it("produces consistent counts for same text and encoding", () => {
      const text = "The quick brown fox jumps over the lazy dog.";
      const count1 = countTokens(text, "cl100k_base");
      const count2 = countTokens(text, "cl100k_base");
      expect(count1).toBe(count2);
    });
  });

  describe("multi-language and special characters", () => {
    it("handles emoji", () => {
      const text = "Hello 👋 World 🌍";
      const count = countTokens(text);
      expect(count).toBeGreaterThan(0);
      expect(count).toBeLessThan(20);
    });

    it("handles unicode characters", () => {
      const text = "café résumé naïve";
      const count = countTokens(text);
      expect(count).toBeGreaterThan(0);
    });

    it("handles mixed scripts", () => {
      const text = "Hello 世界 مرحبا мир";
      const count = countTokens(text);
      expect(count).toBeGreaterThan(0);
    });

    it("handles special characters and symbols", () => {
      const text = "!@#$%^&*()_+-=[]{}|;:',.<>?/~`";
      const count = countTokens(text);
      expect(count).toBeGreaterThan(0);
    });
  });

  describe("code and technical content", () => {
    it("counts tokens in code snippets", () => {
      const code = `function hello() {
  console.log("Hello, world!");
}`;
      const count = countTokens(code);
      expect(count).toBeGreaterThan(5);
    });

    it("counts tokens in markdown", () => {
      const markdown = `# Title\n\n## Subtitle\n\n- Item 1\n- Item 2`;
      const count = countTokens(markdown);
      expect(count).toBeGreaterThan(5);
    });

    it("counts tokens in JSON", () => {
      const json = JSON.stringify({ key: "value", nested: { foo: "bar" } });
      const count = countTokens(json);
      expect(count).toBeGreaterThan(3);
    });
  });

  describe("long text handling", () => {
    it("handles long text efficiently", () => {
      const longText = "Hello world. ".repeat(1000);
      const startTime = Date.now();
      const count = countTokens(longText);
      const endTime = Date.now();
      
      expect(count).toBeGreaterThan(1000);
      expect(endTime - startTime).toBeLessThan(1000); // Should complete in under 1 second
    });

    it("produces expected token count for known text", () => {
      // "Hello" is typically 1 token, " world" is 1 token
      const text = "Hello world";
      const count = countTokens(text);
      expect(count).toBeGreaterThanOrEqual(2);
      expect(count).toBeLessThanOrEqual(3);
    });
  });

  describe("encoder caching", () => {
    it("reuses cached encoder for repeated calls", () => {
      const text = "Test text";
      
      // First call initializes encoder
      const start1 = Date.now();
      countTokens(text, "cl100k_base");
      const time1 = Date.now() - start1;
      
      // Second call should use cached encoder (faster)
      const start2 = Date.now();
      countTokens(text, "cl100k_base");
      const time2 = Date.now() - start2;
      
      // Note: This is a weak assertion since timing can vary
      // Main goal is to ensure no errors with caching
      expect(time2).toBeLessThanOrEqual(time1 + 5);
    });

    it("caches different encodings separately", () => {
      const text = "Test text";
      
      const count1 = countTokens(text, "cl100k_base");
      const count2 = countTokens(text, "o200k_base");
      
      // Different encodings should work independently
      expect(count1).toBeGreaterThan(0);
      expect(count2).toBeGreaterThan(0);
    });
  });
});
