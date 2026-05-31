import { NextRequest, NextResponse } from "next/server";
import { readFile, writeFile, mkdir, unlink, readdir } from "fs/promises";
import { join, resolve, sep, dirname } from "path";
import {
  FRAGMENTS_ROOT,
  invalidateRegistryCache,
  regenerateRegistry,
  withWriteLock,
} from "@/lib/fragmentRegistry";
import { checkWriteAuth } from "@/lib/auth";

const DEFAULTS_PATH = join(FRAGMENTS_ROOT, "defaults.json");
const TIERS_CONFIG_PATH = join(FRAGMENTS_ROOT, "tiers.json");

interface DefaultsSnapshot {
  version: string;
  tiers: Array<{ id: string; label: string }>;
  fragmentCount: number;
  fragments: Array<{ path: string; content: string }>;
}

/** Recursively collect all .yaml files under a directory. */
async function collectYaml(dir: string): Promise<string[]> {
  const results: string[] = [];
  let entries: Awaited<ReturnType<typeof readdir>>;
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

  let defaults: DefaultsSnapshot;
  try {
    const raw = await readFile(DEFAULTS_PATH, "utf-8");
    defaults = JSON.parse(raw) as DefaultsSnapshot;
  } catch {
    return NextResponse.json(
      { error: "defaults.json not found — cannot restore library defaults" },
      { status: 500 }
    );
  }

  if (!Array.isArray(defaults.fragments) || !Array.isArray(defaults.tiers)) {
    return NextResponse.json({ error: "defaults.json is malformed" }, { status: 500 });
  }

  // Validate all paths in the snapshot before touching anything.
  const safeBase = resolve(FRAGMENTS_ROOT);
  for (const frag of defaults.fragments) {
    if (typeof frag.path !== "string" || typeof frag.content !== "string") {
      return NextResponse.json(
        { error: "defaults.json contains an entry with missing path or content" },
        { status: 500 }
      );
    }
    const abs = resolve(join(safeBase, frag.path));
    if (!abs.startsWith(safeBase + sep)) {
      return NextResponse.json(
        { error: "defaults.json contains a path traversal attempt" },
        { status: 500 }
      );
    }
  }

  return withWriteLock(async () => {
    invalidateRegistryCache();

    // 1. Delete all existing .yaml files.
    const existing = await collectYaml(safeBase);
    await Promise.all(existing.map((f) => unlink(f).catch(() => undefined)));

    // 2. Write default fragment YAML files.
    for (const frag of defaults.fragments) {
      const abs = resolve(join(safeBase, frag.path));
      await mkdir(dirname(abs), { recursive: true });
      await writeFile(abs, frag.content, "utf-8");
    }

    // 3. Restore tiers.json.
    await writeFile(
      TIERS_CONFIG_PATH,
      JSON.stringify({ tiers: defaults.tiers }, null, 2) + "\n",
      "utf-8"
    );

    // 4. Regenerate the registry index.
    const count = await regenerateRegistry();

    return NextResponse.json({
      restored: count,
      tiers: defaults.tiers.length,
    });
  });
}
