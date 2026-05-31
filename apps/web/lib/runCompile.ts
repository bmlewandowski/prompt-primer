import { NextResponse } from "next/server";
import { compile, loadFragments, lintFragments } from "@prompt-primer/compiler";
import type { CompileRequest, LintWarning } from "@prompt-primer/compiler";
import { loadValidatedRegistry, loadTiersConfig, FRAGMENTS_ROOT } from "./fragmentRegistry";
import { resolve } from "path";

/**
 * Shared compile logic used by both /api/compile and /api/preview.
 * Handles the registry allowlist check and delegates to the compiler.
 * Also runs fragment quality linting.
 */
export async function runCompile(params: CompileRequest): Promise<NextResponse> {
  let allowedPaths: Set<string>;
  let tierOrder: string[] | undefined;
  try {
    const [registry, tiersConfig] = await Promise.all([
      loadValidatedRegistry(),
      loadTiersConfig().catch(() => null),
    ]);
    ({ allowedPaths } = registry);
    tierOrder = tiersConfig?.tiers.map((t) => t.id);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 503 });
  }

  const unknownPaths = params.fragmentPaths.filter((p) => !allowedPaths.has(p));
  if (unknownPaths.length > 0) {
    return NextResponse.json(
      { error: `Unknown fragment path(s): ${unknownPaths.join(", ")}` },
      { status: 400 }
    );
  }

  try {
    // Compile the fragments
    const result = await compile(params, FRAGMENTS_ROOT, tierOrder);
    
    // Run quality linter on the selected fragments
    let lintWarnings: LintWarning[] = [];
    if (params.fragmentPaths.length > 0) {
      const safeBaseDir = resolve(FRAGMENTS_ROOT);
      const absolutePaths = params.fragmentPaths.map((p) => resolve(safeBaseDir, p));
      const fragments = await loadFragments(absolutePaths);
      lintWarnings = lintFragments(fragments);
    }
    
    // Return compile result with lint warnings
    return NextResponse.json({
      ...result,
      lintWarnings,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
