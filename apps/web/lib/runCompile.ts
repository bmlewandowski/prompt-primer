import { NextResponse } from "next/server";
import { compile } from "@prompt-primer/compiler";
import type { CompileRequest } from "@prompt-primer/compiler";
import { loadValidatedRegistry, FRAGMENTS_ROOT } from "./fragmentRegistry";

/**
 * Shared compile logic used by both /api/compile and /api/preview.
 * Handles the registry allowlist check and delegates to the compiler.
 */
export async function runCompile(params: CompileRequest): Promise<NextResponse> {
  let allowedPaths: Set<string>;
  try {
    ({ allowedPaths } = await loadValidatedRegistry());
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
    const result = await compile(params, FRAGMENTS_ROOT);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
