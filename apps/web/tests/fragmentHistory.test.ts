import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import {
  appendFragmentHistory,
  loadFragmentHistory,
  getFragmentRevision,
  deleteFragmentHistory,
} from "../lib/fragmentHistory";
import type { Fragment } from "@prompt-primer/compiler";
import { rm, mkdir, readFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

// Create a temporary directory for test fixtures
const testDir = join(tmpdir(), `web-history-test-${Date.now()}`);
const historyRoot = join(testDir, ".registry-history");

// Mock the HISTORY_ROOT constant
const originalHistoryRoot = process.env.HISTORY_ROOT;

beforeAll(async () => {
  await mkdir(testDir, { recursive: true });
  // Set environment variable to point to test directory
  process.env.HISTORY_ROOT = historyRoot;
});

afterAll(async () => {
  await rm(testDir, { recursive: true, force: true });
  if (originalHistoryRoot) {
    process.env.HISTORY_ROOT = originalHistoryRoot;
  } else {
    delete process.env.HISTORY_ROOT;
  }
});

beforeEach(async () => {
  // Clean up history directory between tests
  try {
    await rm(historyRoot, { recursive: true, force: true });
  } catch {
    // Ignore if doesn't exist
  }
});

const createMockFragment = (id: string): Fragment => ({
  id,
  tier: "task",
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
    identity: "Test identity",
    context: null,
    steps: null,
    rules: [],
  },
});

describe("appendFragmentHistory", () => {
  it("creates history file on first append", async () => {
    const fragment = createMockFragment("test_fragment");
    
    await appendFragmentHistory("test_fragment", fragment);
    
    const historyFile = join(historyRoot, "test_fragment.jsonl");
    const content = await readFile(historyFile, "utf-8");
    
    expect(content).toBeTruthy();
    expect(content.trim().split("\n")).toHaveLength(1);
  });

  it("appends to existing history file", async () => {
    const fragment1 = createMockFragment("test_fragment");
    const fragment2 = { ...fragment1, blocks: { ...fragment1.blocks, identity: "Updated" } };
    
    await appendFragmentHistory("test_fragment", fragment1);
    await appendFragmentHistory("test_fragment", fragment2);
    
    const historyFile = join(historyRoot, "test_fragment.jsonl");
    const content = await readFile(historyFile, "utf-8");
    const lines = content.trim().split("\n");
    
    expect(lines).toHaveLength(2);
  });

  it("stores complete fragment snapshot", async () => {
    const fragment = createMockFragment("test_fragment");
    
    await appendFragmentHistory("test_fragment", fragment);
    
    const history = await loadFragmentHistory("test_fragment");
    expect(history[0].fragment).toEqual(fragment);
  });

  it("stores timestamp with revision", async () => {
    const fragment = createMockFragment("test_fragment");
    const beforeAppend = new Date().toISOString();
    
    await appendFragmentHistory("test_fragment", fragment);
    
    const afterAppend = new Date().toISOString();
    const history = await loadFragmentHistory("test_fragment");
    
    expect(history[0].timestamp).toBeDefined();
    expect(history[0].timestamp >= beforeAppend).toBe(true);
    expect(history[0].timestamp <= afterAppend).toBe(true);
  });

  it("accepts optional note", async () => {
    const fragment = createMockFragment("test_fragment");
    const note = "Initial version";
    
    await appendFragmentHistory("test_fragment", fragment, note);
    
    const history = await loadFragmentHistory("test_fragment");
    expect(history[0].note).toBe(note);
  });

  it("handles fragments with special characters in ID", async () => {
    const fragment = createMockFragment("test-fragment_v2");
    
    await appendFragmentHistory("test-fragment_v2", fragment);
    
    const history = await loadFragmentHistory("test-fragment_v2");
    expect(history).toHaveLength(1);
  });

  it("creates directory structure if needed", async () => {
    // Remove the directory to force recreation
    await rm(historyRoot, { recursive: true, force: true });
    
    const fragment = createMockFragment("test_fragment");
    
    await appendFragmentHistory("test_fragment", fragment);
    
    const history = await loadFragmentHistory("test_fragment");
    expect(history).toHaveLength(1);
  });
});

describe("loadFragmentHistory", () => {
  it("returns empty array for non-existent history", async () => {
    const history = await loadFragmentHistory("nonexistent_fragment");
    
    expect(history).toEqual([]);
  });

  it("returns revisions in reverse chronological order (newest first)", async () => {
    const fragment = createMockFragment("test_fragment");
    
    // Add multiple revisions with small delays
    await appendFragmentHistory("test_fragment", fragment, "First");
    await new Promise(resolve => setTimeout(resolve, 10));
    await appendFragmentHistory("test_fragment", fragment, "Second");
    await new Promise(resolve => setTimeout(resolve, 10));
    await appendFragmentHistory("test_fragment", fragment, "Third");
    
    const history = await loadFragmentHistory("test_fragment");
    
    expect(history).toHaveLength(3);
    expect(history[0].note).toBe("Third");
    expect(history[1].note).toBe("Second");
    expect(history[2].note).toBe("First");
  });

  it("parses each line as separate revision", async () => {
    const fragment = createMockFragment("test_fragment");
    
    await appendFragmentHistory("test_fragment", fragment);
    await appendFragmentHistory("test_fragment", { ...fragment, blocks: { ...fragment.blocks, identity: "V2" } });
    await appendFragmentHistory("test_fragment", { ...fragment, blocks: { ...fragment.blocks, identity: "V3" } });
    
    const history = await loadFragmentHistory("test_fragment");
    
    expect(history).toHaveLength(3);
    expect(history[0].fragment.blocks.identity).toBe("V3");
    expect(history[1].fragment.blocks.identity).toBe("V2");
    expect(history[2].fragment.blocks.identity).toBe("Test identity");
  });

  it("skips malformed lines", async () => {
    const fragment = createMockFragment("test_fragment");
    
    await appendFragmentHistory("test_fragment", fragment);
    
    // Manually corrupt the file
    const historyFile = join(historyRoot, "test_fragment.jsonl");
    const content = await readFile(historyFile, "utf-8");
    await require("fs").promises.writeFile(
      historyFile,
      content + "not valid json\n",
      "utf-8"
    );
    
    const history = await loadFragmentHistory("test_fragment");
    
    // Should only include the valid line
    expect(history).toHaveLength(1);
  });

  it("handles empty history file", async () => {
    await mkdir(historyRoot, { recursive: true });
    const historyFile = join(historyRoot, "empty_fragment.jsonl");
    await require("fs").promises.writeFile(historyFile, "", "utf-8");
    
    const history = await loadFragmentHistory("empty_fragment");
    
    expect(history).toEqual([]);
  });
});

describe("getFragmentRevision", () => {
  it("returns revision with matching timestamp", async () => {
    const fragment = createMockFragment("test_fragment");
    
    await appendFragmentHistory("test_fragment", fragment);
    const history = await loadFragmentHistory("test_fragment");
    const timestamp = history[0].timestamp;
    
    const revision = await getFragmentRevision("test_fragment", timestamp);
    
    expect(revision).toEqual(history[0]);
  });

  it("returns null for non-existent timestamp", async () => {
    const fragment = createMockFragment("test_fragment");
    
    await appendFragmentHistory("test_fragment", fragment);
    
    const revision = await getFragmentRevision("test_fragment", "2020-01-01T00:00:00.000Z");
    
    expect(revision).toBeNull();
  });

  it("returns null for non-existent fragment", async () => {
    const revision = await getFragmentRevision("nonexistent", "2026-05-31T00:00:00.000Z");
    
    expect(revision).toBeNull();
  });

  it("returns correct revision when multiple exist", async () => {
    const fragment = createMockFragment("test_fragment");
    
    await appendFragmentHistory("test_fragment", fragment, "V1");
    await new Promise(resolve => setTimeout(resolve, 10));
    await appendFragmentHistory("test_fragment", { ...fragment, blocks: { ...fragment.blocks, identity: "V2" } }, "V2");
    await new Promise(resolve => setTimeout(resolve, 10));
    await appendFragmentHistory("test_fragment", { ...fragment, blocks: { ...fragment.blocks, identity: "V3" } }, "V3");
    
    const history = await loadFragmentHistory("test_fragment");
    const middleTimestamp = history[1].timestamp;
    
    const revision = await getFragmentRevision("test_fragment", middleTimestamp);
    
    expect(revision?.note).toBe("V2");
    expect(revision?.fragment.blocks.identity).toBe("V2");
  });
});

describe("deleteFragmentHistory", () => {
  it("deletes history file", async () => {
    const fragment = createMockFragment("test_fragment");
    
    await appendFragmentHistory("test_fragment", fragment);
    await deleteFragmentHistory("test_fragment");
    
    const history = await loadFragmentHistory("test_fragment");
    expect(history).toEqual([]);
  });

  it("does not throw if file does not exist", async () => {
    await expect(deleteFragmentHistory("nonexistent")).resolves.not.toThrow();
  });

  it("only deletes specified fragment history", async () => {
    const fragment1 = createMockFragment("fragment_1");
    const fragment2 = createMockFragment("fragment_2");
    
    await appendFragmentHistory("fragment_1", fragment1);
    await appendFragmentHistory("fragment_2", fragment2);
    
    await deleteFragmentHistory("fragment_1");
    
    const history1 = await loadFragmentHistory("fragment_1");
    const history2 = await loadFragmentHistory("fragment_2");
    
    expect(history1).toEqual([]);
    expect(history2).toHaveLength(1);
  });
});

describe("fragment history integration", () => {
  it("supports full lifecycle: append, load, restore", async () => {
    const original = createMockFragment("lifecycle_test");
    const updated = { ...original, blocks: { ...original.blocks, identity: "Updated" } };
    
    // Append original version
    await appendFragmentHistory("lifecycle_test", original, "Original");
    
    // Append updated version
    await appendFragmentHistory("lifecycle_test", updated, "Updated");
    
    // Load history
    const history = await loadFragmentHistory("lifecycle_test");
    expect(history).toHaveLength(2);
    
    // Get original version
    const originalRevision = await getFragmentRevision("lifecycle_test", history[1].timestamp);
    expect(originalRevision?.fragment.blocks.identity).toBe("Test identity");
    
    // Clean up
    await deleteFragmentHistory("lifecycle_test");
    expect(await loadFragmentHistory("lifecycle_test")).toEqual([]);
  });

  it("handles rapid successive updates", async () => {
    const fragment = createMockFragment("rapid_test");
    
    // Append 10 versions rapidly
    for (let i = 0; i < 10; i++) {
      await appendFragmentHistory("rapid_test", {
        ...fragment,
        blocks: { ...fragment.blocks, identity: `Version ${i}` },
      });
    }
    
    const history = await loadFragmentHistory("rapid_test");
    expect(history).toHaveLength(10);
    expect(history[0].fragment.blocks.identity).toBe("Version 9");
    expect(history[9].fragment.blocks.identity).toBe("Version 0");
  });

  it("preserves all fragment fields in history", async () => {
    const fragment: Fragment = {
      id: "complete_fragment",
      tier: "team",
      meta: {
        version: "2.1.0",
        description: "Complete test",
        tags: ["test", "complete"],
        author: "tester",
        updated: "2026-05-31",
        fabric_source: "https://example.com/pattern",
      },
      depends_on: ["dep1", "dep2"],
      replace_blocks: ["identity", "context"],
      blocks: {
        identity: "Full identity",
        context: "Full context",
        steps: "Full steps",
        rules: [
          { content: "Rule 1" },
          { key: "format", content: "Rule 2" },
        ],
      },
    };
    
    await appendFragmentHistory("complete_fragment", fragment);
    
    const history = await loadFragmentHistory("complete_fragment");
    const restored = history[0].fragment;
    
    expect(restored).toEqual(fragment);
    expect(restored.meta.tags).toEqual(["test", "complete"]);
    expect(restored.depends_on).toEqual(["dep1", "dep2"]);
    expect(restored.replace_blocks).toEqual(["identity", "context"]);
    expect(restored.blocks.rules).toHaveLength(2);
  });
});
