import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { join, resolve, sep } from "path";
import { parse } from "yaml";
import { FragmentSchema } from "@prompt-primer/compiler";
import { loadValidatedRegistry, FRAGMENTS_ROOT } from "@/lib/fragmentRegistry";

export async function GET() {
  try {
    const { entries } = await loadValidatedRegistry();
    const safeBase = resolve(FRAGMENTS_ROOT);

    const fragments = [];
    const errors: string[] = [];

    for (const entry of entries) {
      const absPath = resolve(join(safeBase, entry.path));
      if (!absPath.startsWith(safeBase + sep)) {
        errors.push(`Skipped unsafe path: ${entry.path}`);
        continue;
      }
      try {
        const raw = await readFile(absPath, "utf-8");
        const result = FragmentSchema.safeParse(parse(raw));
        if (result.success) {
          fragments.push(result.data);
        } else {
          errors.push(`${entry.path}: ${result.error.message}`);
        }
      } catch (err) {
        errors.push(`${entry.path}: ${String(err)}`);
      }
    }

    const bundle = {
      version: "1",
      exportedAt: new Date().toISOString(),
      fragmentCount: fragments.length,
      fragments,
      ...(errors.length > 0 ? { errors } : {}),
    };

    const date = new Date().toISOString().split("T")[0];
    return new NextResponse(JSON.stringify(bundle, null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="prompt-primer-export-${date}.json"`,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
