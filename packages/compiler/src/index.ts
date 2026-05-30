import { loadFragments } from "./loader.js";
import { mergeFragments, buildManifestFragments } from "./merger.js";
import { renderMarkdown, renderOpenAIMessage } from "./renderer.js";
import { countTokens } from "./tokenizer.js";
import { resolve, sep } from "path";
import {
  CompileRequest,
  CompileResult,
  CompilationManifest,
} from "./types.js";

export async function compile(
  request: CompileRequest,
  fragmentsBaseDir: string
): Promise<CompileResult> {
  const { fragmentPaths, tokenBudget, encoding } = request;

  // Resolve base dir to an absolute, normalized path so containment checks
  // are reliable regardless of how the caller constructed fragmentsBaseDir.
  const safeBaseDir = resolve(fragmentsBaseDir);

  const absolutePaths = fragmentPaths.map((p) => {
    const resolved = resolve(safeBaseDir, p);
    // Reject any path that escapes the fragments base directory — this catches
    // both ../traversal and absolute paths like /etc/passwd.
    if (!resolved.startsWith(safeBaseDir + sep)) {
      throw new Error(`Unsafe fragment path rejected: "${p}"`);
    }
    return resolved;
  });

  const fragments = await loadFragments(absolutePaths);
  const { blocks, conflictResolutions, missingDependencies } =
    mergeFragments(fragments);

  const markdown = renderMarkdown(blocks);
  const openAIMessage = renderOpenAIMessage(blocks);
  const tokenCount = countTokens(markdown, encoding);

  const manifest: CompilationManifest = {
    compiledAt: new Date().toISOString(),
    selectedFragments: buildManifestFragments(fragments, fragmentPaths),
    tokenCount,
    tokenBudget,
    exceedsBudget: tokenCount > tokenBudget,
    conflictResolutions,
    missingDependencies,
  };

  return { markdown, openAIMessage, manifest };
}

// Re-export everything consumers might need
export { countTokens } from "./tokenizer.js";
export { renderMarkdown, renderOpenAIMessage } from "./renderer.js";
export { loadFragment, loadFragments, FragmentLoadError } from "./loader.js";
export { mergeFragments } from "./merger.js";
export type {
  Fragment,
  FragmentMeta,
  Blocks,
  Rule,
  Tier,
  CompileRequest,
  CompileResult,
  CompilationManifest,
  ConflictResolution,
  ManifestFragment,
  RegistryEntry,
} from "./types.js";
export {
  FragmentSchema,
  RegistryEntrySchema,
  CompileRequestSchema,
  TIER_ORDER,
} from "./types.js";
