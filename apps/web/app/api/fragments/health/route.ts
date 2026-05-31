import { NextResponse } from "next/server";
import { readFile, readdir } from "fs/promises";
import { join, relative } from "path";
import { parse } from "yaml";
import { FragmentSchema } from "@prompt-primer/compiler";
import { FRAGMENTS_ROOT } from "@/lib/fragmentRegistry";

export interface HealthIssue {
  path: string;
  error: string;
}

export interface HealthResult {
  ok: boolean;
  scanned: number;
  issues: HealthIssue[];
}

async function* walkYaml(dir: string): AsyncGenerator<string> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!entry.name.startsWith(".") && entry.name !== "scripts") {
        yield* walkYaml(fullPath);
      }
    } else if (entry.isFile() && entry.name.endsWith(".yaml")) {
      yield fullPath;
    }
  }
}

export async function GET(): Promise<NextResponse<HealthResult>> {
  const issues: HealthIssue[] = [];
  let scanned = 0;

  for await (const absPath of walkYaml(FRAGMENTS_ROOT)) {
    const rel = relative(FRAGMENTS_ROOT, absPath);
    scanned++;
    try {
      const raw = await readFile(absPath, "utf-8");
      const parsed = parse(raw);
      const result = FragmentSchema.safeParse(parsed);
      if (!result.success) {
        issues.push({
          path: rel,
          error: result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
        });
      }
    } catch (err) {
      issues.push({ path: rel, error: String(err) });
    }
  }

  return NextResponse.json({ ok: issues.length === 0, scanned, issues });
}
