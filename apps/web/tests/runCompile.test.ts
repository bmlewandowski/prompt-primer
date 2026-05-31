import { describe, it, expect, vi, beforeEach } from "vitest";
import { runCompile } from "../lib/runCompile";
import type { CompileRequest } from "@prompt-primer/compiler";

// Mock the dependencies
vi.mock("../lib/fragmentRegistry", () => ({
  loadValidatedRegistry: vi.fn(),
  loadTiersConfig: vi.fn(),
  FRAGMENTS_ROOT: "/mock/fragments",
}));

vi.mock("@prompt-primer/compiler", () => ({
  compile: vi.fn(),
  loadFragments: vi.fn(),
  lintFragments: vi.fn(),
}));

import { loadValidatedRegistry, loadTiersConfig } from "../lib/fragmentRegistry";
import { compile, loadFragments, lintFragments } from "@prompt-primer/compiler";

describe("runCompile", () => {
  const mockRegistry = {
    entries: [],
    allowedPaths: new Set(["org/global_default.yaml", "team/backend.yaml", "task/code_review.yaml"]),
  };

  const mockTiersConfig = {
    tiers: [
      { id: "org", label: "Organization" },
      { id: "team", label: "Team" },
      { id: "task", label: "Task" },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(loadValidatedRegistry).mockResolvedValue(mockRegistry);
    vi.mocked(loadTiersConfig).mockResolvedValue(mockTiersConfig);
  });

  describe("successful compilation", () => {
    it("compiles fragments with valid paths", async () => {
      const request: CompileRequest = {
        fragmentPaths: ["org/global_default.yaml", "team/backend.yaml"],
        tokenBudget: 8192,
        encoding: "cl100k_base",
        outputFormat: "fabric",
      };

      const mockCompileResult = {
        markdown: "# Test Output",
        tokenCount: 100,
        manifest: { fragments: [], totalTokens: 100 },
      };

      vi.mocked(compile).mockResolvedValue(mockCompileResult);
      vi.mocked(loadFragments).mockResolvedValue([]);
      vi.mocked(lintFragments).mockReturnValue([]);

      const response = await runCompile(request);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body).toMatchObject(mockCompileResult);
      expect(body.lintWarnings).toEqual([]);
      expect(compile).toHaveBeenCalledWith(request, "/mock/fragments", ["org", "team", "task"]);
    });

    it("includes lint warnings in response", async () => {
      const request: CompileRequest = {
        fragmentPaths: ["task/code_review.yaml"],
        tokenBudget: 8192,
        encoding: "cl100k_base",
        outputFormat: "fabric",
      };

      const mockCompileResult = {
        markdown: "# Test Output",
        tokenCount: 100,
        manifest: { fragments: [], totalTokens: 100 },
      };

      const mockLintWarnings = [
        {
          fragmentId: "code_review",
          category: "identity_clarity",
          message: "Identity uses vague word: 'help'",
          suggestion: "Be more specific than 'help'",
        },
      ];

      vi.mocked(compile).mockResolvedValue(mockCompileResult);
      vi.mocked(loadFragments).mockResolvedValue([]);
      vi.mocked(lintFragments).mockReturnValue(mockLintWarnings);

      const response = await runCompile(request);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.lintWarnings).toEqual(mockLintWarnings);
      expect(lintFragments).toHaveBeenCalled();
    });

    it("handles custom tier order from config", async () => {
      const customTiersConfig = {
        tiers: [
          { id: "org", label: "Organization" },
          { id: "persona", label: "Persona" },
          { id: "task", label: "Task" },
        ],
      };

      vi.mocked(loadTiersConfig).mockResolvedValue(customTiersConfig);

      const request: CompileRequest = {
        fragmentPaths: ["org/global_default.yaml"],
        tokenBudget: 8192,
        encoding: "cl100k_base",
        outputFormat: "fabric",
      };

      vi.mocked(compile).mockResolvedValue({
        markdown: "# Test",
        tokenCount: 50,
        manifest: { fragments: [], totalTokens: 50 },
      });
      vi.mocked(loadFragments).mockResolvedValue([]);
      vi.mocked(lintFragments).mockReturnValue([]);

      await runCompile(request);

      expect(compile).toHaveBeenCalledWith(request, "/mock/fragments", ["org", "persona", "task"]);
    });

    it("handles missing tiers config gracefully", async () => {
      vi.mocked(loadTiersConfig).mockRejectedValue(new Error("Tiers config not found"));

      const request: CompileRequest = {
        fragmentPaths: ["org/global_default.yaml"],
        tokenBudget: 8192,
        encoding: "cl100k_base",
        outputFormat: "fabric",
      };

      vi.mocked(compile).mockResolvedValue({
        markdown: "# Test",
        tokenCount: 50,
        manifest: { fragments: [], totalTokens: 50 },
      });
      vi.mocked(loadFragments).mockResolvedValue([]);
      vi.mocked(lintFragments).mockReturnValue([]);

      const response = await runCompile(request);

      expect(response.status).toBe(200);
      expect(compile).toHaveBeenCalledWith(request, "/mock/fragments", undefined);
    });

    it("skips linting when no fragments are provided", async () => {
      const request: CompileRequest = {
        fragmentPaths: [],
        tokenBudget: 8192,
        encoding: "cl100k_base",
        outputFormat: "fabric",
      };

      vi.mocked(compile).mockResolvedValue({
        markdown: "",
        tokenCount: 0,
        manifest: { fragments: [], totalTokens: 0 },
      });

      const response = await runCompile(request);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.lintWarnings).toEqual([]);
      expect(loadFragments).not.toHaveBeenCalled();
      expect(lintFragments).not.toHaveBeenCalled();
    });
  });

  describe("validation and errors", () => {
    it("rejects unknown fragment paths with 400", async () => {
      const request: CompileRequest = {
        fragmentPaths: ["org/global_default.yaml", "unknown/fragment.yaml"],
        tokenBudget: 8192,
        encoding: "cl100k_base",
        outputFormat: "fabric",
      };

      const response = await runCompile(request);
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.error).toContain("Unknown fragment path(s)");
      expect(body.error).toContain("unknown/fragment.yaml");
      expect(compile).not.toHaveBeenCalled();
    });

    it("rejects multiple unknown paths with 400", async () => {
      const request: CompileRequest = {
        fragmentPaths: ["unknown1.yaml", "unknown2.yaml"],
        tokenBudget: 8192,
        encoding: "cl100k_base",
        outputFormat: "fabric",
      };

      const response = await runCompile(request);
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.error).toContain("unknown1.yaml");
      expect(body.error).toContain("unknown2.yaml");
    });

    it("returns 503 when registry loading fails", async () => {
      vi.mocked(loadValidatedRegistry).mockRejectedValue(new Error("Registry corrupted"));

      const request: CompileRequest = {
        fragmentPaths: ["org/global_default.yaml"],
        tokenBudget: 8192,
        encoding: "cl100k_base",
        outputFormat: "fabric",
      };

      const response = await runCompile(request);
      const body = await response.json();

      expect(response.status).toBe(503);
      expect(body.error).toBe("Registry corrupted");
      expect(compile).not.toHaveBeenCalled();
    });

    it("returns 500 when compilation fails", async () => {
      const request: CompileRequest = {
        fragmentPaths: ["org/global_default.yaml"],
        tokenBudget: 8192,
        encoding: "cl100k_base",
        outputFormat: "fabric",
      };

      vi.mocked(compile).mockRejectedValue(new Error("Compilation error"));

      const response = await runCompile(request);
      const body = await response.json();

      expect(response.status).toBe(500);
      expect(body.error).toBe("Compilation error");
    });

    it("handles non-Error exceptions in registry loading", async () => {
      vi.mocked(loadValidatedRegistry).mockRejectedValue("String error");

      const request: CompileRequest = {
        fragmentPaths: ["org/global_default.yaml"],
        tokenBudget: 8192,
        encoding: "cl100k_base",
        outputFormat: "fabric",
      };

      const response = await runCompile(request);
      const body = await response.json();

      expect(response.status).toBe(503);
      expect(body.error).toBe("String error");
    });

    it("handles non-Error exceptions in compilation", async () => {
      const request: CompileRequest = {
        fragmentPaths: ["org/global_default.yaml"],
        tokenBudget: 8192,
        encoding: "cl100k_base",
        outputFormat: "fabric",
      };

      vi.mocked(compile).mockRejectedValue({ custom: "error object" });

      const response = await runCompile(request);
      const body = await response.json();

      expect(response.status).toBe(500);
      expect(body.error).toContain("object");
    });
  });

  describe("output formats", () => {
    it("supports all output formats", async () => {
      const formats = ["fabric", "xml", "prose", "json", "chatml"] as const;

      for (const format of formats) {
        vi.clearAllMocks();

        const request: CompileRequest = {
          fragmentPaths: ["org/global_default.yaml"],
          tokenBudget: 8192,
          encoding: "cl100k_base",
          outputFormat: format,
        };

        vi.mocked(compile).mockResolvedValue({
          markdown: `# ${format} output`,
          tokenCount: 50,
          manifest: { fragments: [], totalTokens: 50 },
        });
        vi.mocked(loadFragments).mockResolvedValue([]);
        vi.mocked(lintFragments).mockReturnValue([]);

        const response = await runCompile(request);

        expect(response.status).toBe(200);
        expect(compile).toHaveBeenCalledWith(
          expect.objectContaining({ outputFormat: format }),
          "/mock/fragments",
          expect.anything()
        );
      }
    });
  });

  describe("token encoding", () => {
    it("supports cl100k_base encoding", async () => {
      const request: CompileRequest = {
        fragmentPaths: ["org/global_default.yaml"],
        tokenBudget: 8192,
        encoding: "cl100k_base",
        outputFormat: "fabric",
      };

      vi.mocked(compile).mockResolvedValue({
        markdown: "# Test",
        tokenCount: 50,
        manifest: { fragments: [], totalTokens: 50 },
      });
      vi.mocked(loadFragments).mockResolvedValue([]);
      vi.mocked(lintFragments).mockReturnValue([]);

      await runCompile(request);

      expect(compile).toHaveBeenCalledWith(
        expect.objectContaining({ encoding: "cl100k_base" }),
        "/mock/fragments",
        expect.anything()
      );
    });

    it("supports o200k_base encoding", async () => {
      const request: CompileRequest = {
        fragmentPaths: ["org/global_default.yaml"],
        tokenBudget: 8192,
        encoding: "o200k_base",
        outputFormat: "fabric",
      };

      vi.mocked(compile).mockResolvedValue({
        markdown: "# Test",
        tokenCount: 50,
        manifest: { fragments: [], totalTokens: 50 },
      });
      vi.mocked(loadFragments).mockResolvedValue([]);
      vi.mocked(lintFragments).mockReturnValue([]);

      await runCompile(request);

      expect(compile).toHaveBeenCalledWith(
        expect.objectContaining({ encoding: "o200k_base" }),
        "/mock/fragments",
        expect.anything()
      );
    });
  });
});
