import { NextRequest, NextResponse } from "next/server";
import { writeFile, unlink, readdir } from "fs/promises";
import { join, resolve } from "path";
import {
  FRAGMENTS_ROOT,
  invalidateRegistryCache,
  regenerateRegistry,
  withWriteLock,
} from "@/lib/fragmentRegistry";
import { checkWriteAuth } from "@/lib/auth";

const TIERS_CONFIG_PATH = join(FRAGMENTS_ROOT, "tiers.json");

const DEFAULT_TIERS = [
  { id: "org", label: "Organization" },
  { id: "department", label: "Departments" },
  { id: "team", label: "Teams" },
  { id: "project", label: "Projects" },
  { id: "persona", label: "Personas" },
  { id: "task", label: "Tasks" },
];

/** Recursively collect all .yaml files under a directory. */
async function collectYaml(dir: string): Promise<string[]> {
  const results: string[] = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return results;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...(await collectYaml(full)));
    } else if (entry.name.endsWith(".yaml")) {
      results.push(full);
    }
  }
  return results;
}

export async function POST(req: NextRequest) {
  const authError = checkWriteAuth(req);
  if (authError) return authError;

  return withWriteLock(async () => {
    invalidateRegistryCache();

    const safeBase = resolve(FRAGMENTS_ROOT);

    // 1. Delete all existing .yaml files.
    const existing = await collectYaml(safeBase);
    await Promise.all(existing.map((f) => unlink(f).catch(() => undefined)));

    // 2. Reset tiers.json to default structure.
    await writeFile(
      TIERS_CONFIG_PATH,
      JSON.stringify({ tiers: DEFAULT_TIERS }, null, 2) + "\n",
      "utf-8"
    );

    // 3. Regenerate the registry index (will be empty).
    await regenerateRegistry();

    return NextResponse.json({
      cleared: existing.length,
      message: "Fragment library cleared. Select a starter pack or create fragments from scratch.",
    });
  });
}
