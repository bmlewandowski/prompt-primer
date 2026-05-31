import { readFile, writeFile, mkdir, unlink, readdir } from "fs/promises";
import { join, resolve, sep, dirname, relative } from "path";
import { parse, stringify } from "yaml";
import { RegistryEntrySchema, FragmentSchema } from "@prompt-primer/compiler";
import type { RegistryEntry, Fragment } from "@prompt-primer/compiler";

export const FRAGMENTS_ROOT =
  process.env.FRAGMENTS_ROOT ?? join(process.cwd(), "../../packages/fragments");

const REGISTRY_PATH = join(FRAGMENTS_ROOT, ".registry.json");
const TIERS_CONFIG_PATH = join(FRAGMENTS_ROOT, "tiers.json");

// ---------------------------------------------------------------------------
// Write mutex — serializes all disk-mutating operations to prevent registry
// corruption from concurrent PUT/POST/DELETE requests in the same process.
// ---------------------------------------------------------------------------
let _writeLock: Promise<void> = Promise.resolve();

export async function withWriteLock<T>(fn: () => Promise<T>): Promise<T> {
  let release!: () => void;
  const prev = _writeLock;
  _writeLock = new Promise<void>((res) => {
    release = res;
  });
  await prev;
  try {
    return await fn();
  } finally {
    release();
  }
}

// ---------------------------------------------------------------------------
// In-process registry cache — avoids re-reading + re-validating .registry.json
// on every request. Invalidated at the start of every write operation.
// ---------------------------------------------------------------------------
type RegistryCache = { entries: RegistryEntry[]; allowedPaths: Set<string> };
let _registryCache: RegistryCache | null = null;

export function invalidateRegistryCache(): void {
  _registryCache = null;
}

// ---------------------------------------------------------------------------
// FRAGMENTS_ROOT existence check — warns once on startup if the path is wrong
// ---------------------------------------------------------------------------
let _rootChecked = false;
async function checkFragmentsRoot(): Promise<void> {
  if (_rootChecked) return;
  _rootChecked = true;
  try {
    await readdir(FRAGMENTS_ROOT);
  } catch {
    console.warn(
      `[prompt-primer] FRAGMENTS_ROOT does not exist: "${FRAGMENTS_ROOT}"\n` +
        `  Set the FRAGMENTS_ROOT env var to the correct absolute path, or run\n` +
        `  the dev server from the monorepo root so the relative fallback resolves.`
    );
  }
}

// ---------------------------------------------------------------------------
// Tier config types + helpers
// ---------------------------------------------------------------------------
export interface TierConfig {
  id: string;
  label: string;
}
export interface TiersConfig {
  tiers: TierConfig[];
}

export const DEFAULT_TIERS: TierConfig[] = [
  { id: "org", label: "Organization" },
  { id: "department", label: "Departments" },
  { id: "team", label: "Teams" },
  { id: "project", label: "Projects" },
  { id: "persona", label: "Personas" },
  { id: "task", label: "Tasks" },
];

export async function loadTiersConfig(): Promise<TiersConfig> {
  try {
    const raw = await readFile(TIERS_CONFIG_PATH, "utf-8");
    const parsed = JSON.parse(raw) as TiersConfig;
    if (!Array.isArray(parsed?.tiers)) return { tiers: DEFAULT_TIERS };
    return parsed;
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return { tiers: DEFAULT_TIERS };
    }
    throw err;
  }
}

export async function saveTiersConfig(config: TiersConfig): Promise<void> {
  await writeFile(TIERS_CONFIG_PATH, JSON.stringify(config, null, 2) + "\n", "utf-8");
}

/**
 * Reads .registry.json and validates every entry against RegistryEntrySchema.
 *
 * Results are cached in-process. The cache is invalidated at the start of
 * every write operation (via withWriteLock) and updated incrementally by
 * the saveFragmentAndUpdateRegistry / deleteFragmentAndUpdateRegistry helpers.
 *
 * Returns the validated entries and a Set of allowed relative paths.
 * Use allowedPaths as an allowlist before passing any caller-supplied path
 * to the compiler — this prevents both path traversal and registry tampering.
 *
 * Throws if the registry is missing, not valid JSON, or contains any entry
 * that fails schema validation.
 */
export async function loadValidatedRegistry(): Promise<{
  entries: RegistryEntry[];
  allowedPaths: Set<string>;
}> {
  await checkFragmentsRoot();

  if (_registryCache) return _registryCache;

  let raw: string;
  try {
    raw = await readFile(REGISTRY_PATH, "utf-8");
  } catch {
    throw new Error(
      "Fragment registry not found. Run `pnpm generate-registry` to build it."
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Fragment registry is corrupted (invalid JSON).");
  }

  if (!Array.isArray(parsed)) {
    throw new Error("Fragment registry is corrupted (expected an array).");
  }

  const entries: RegistryEntry[] = [];
  for (const item of parsed as unknown[]) {
    const result = RegistryEntrySchema.safeParse(item);
    if (!result.success) {
      throw new Error(
        `Fragment registry contains an invalid entry: ${JSON.stringify(item)}`
      );
    }
    entries.push(result.data);
  }

  _registryCache = {
    entries,
    allowedPaths: new Set(entries.map((e) => e.path)),
  };
  return _registryCache;
}

// ---------------------------------------------------------------------------
// Registry regeneration
// ---------------------------------------------------------------------------
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

export async function regenerateRegistry(): Promise<number> {
  const { tiers } = await loadTiersConfig();
  const tierOrder = tiers.map((t) => t.id);
  const registry: RegistryEntry[] = [];
  const errors: string[] = [];

  for await (const filePath of walkYaml(FRAGMENTS_ROOT)) {
    const rel = relative(FRAGMENTS_ROOT, filePath);
    try {
      const raw = await readFile(filePath, "utf-8");
      const parsed = parse(raw);
      const result = RegistryEntrySchema.safeParse({
        id: parsed.id,
        tier: parsed.tier,
        path: rel,
        meta: parsed.meta,
        depends_on: parsed.depends_on ?? [],
      });
      if (result.success) {
        registry.push(result.data);
      } else {
        errors.push(`${rel}: ${result.error.message}`);
      }
    } catch (err) {
      errors.push(`${rel}: ${String(err)}`);
    }
  }

  if (errors.length > 0) {
    throw new Error(`Registry errors:\n${errors.join("\n")}`);
  }

  registry.sort((a, b) => {
    const ai = tierOrder.indexOf(a.tier);
    const bi = tierOrder.indexOf(b.tier);
    const ea = ai === -1 ? tierOrder.length : ai;
    const eb = bi === -1 ? tierOrder.length : bi;
    if (ea !== eb) return ea - eb;
    return a.id.localeCompare(b.id);
  });

  await writeFile(REGISTRY_PATH, JSON.stringify(registry, null, 2) + "\n", "utf-8");

  // Update cache after full rebuild
  _registryCache = {
    entries: registry,
    allowedPaths: new Set(registry.map((e) => e.path)),
  };

  return registry.length;
}

// ---------------------------------------------------------------------------
// Fragment CRUD helpers
// ---------------------------------------------------------------------------
const SAFE_ID_RE = /^[a-z0-9_-]+$/;

function assertSafeIds(tier: string, id: string) {
  if (!SAFE_ID_RE.test(tier)) throw new Error(`Invalid tier id: "${tier}"`);
  if (!SAFE_ID_RE.test(id)) throw new Error(`Invalid fragment id: "${id}"`);
}

function resolveFragmentPath(tier: string, id: string): string {
  assertSafeIds(tier, id);
  const safeBase = resolve(FRAGMENTS_ROOT);
  const abs = resolve(join(safeBase, tier, `${id}.yaml`));
  if (!abs.startsWith(safeBase + sep)) throw new Error("Path traversal rejected");
  return abs;
}

export async function getFragmentById(id: string): Promise<Fragment | null> {
  let entry: RegistryEntry | undefined;
  try {
    const { entries } = await loadValidatedRegistry();
    entry = entries.find((e) => e.id === id);
  } catch {
    return null;
  }
  if (!entry) return null;

  const safeBase = resolve(FRAGMENTS_ROOT);
  const absPath = resolve(join(safeBase, entry.path));
  if (!absPath.startsWith(safeBase + sep)) return null;

  try {
    const raw = await readFile(absPath, "utf-8");
    const parsed = parse(raw);
    const result = FragmentSchema.safeParse(parsed);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

/**
 * Write a fragment to disk.
 * If previousPath is supplied and differs from the new derived path, the old
 * file is deleted first (handles tier changes and id renames).
 */
export async function saveFragment(
  fragment: Fragment,
  previousPath?: string
): Promise<void> {
  const { tier, id } = fragment;
  const newAbsPath = resolveFragmentPath(tier, id);
  const newRelPath = join(tier, `${id}.yaml`);

  if (previousPath && previousPath !== newRelPath) {
    const safeBase = resolve(FRAGMENTS_ROOT);
    const oldAbs = resolve(join(safeBase, previousPath));
    if (oldAbs.startsWith(safeBase + sep)) {
      await unlink(oldAbs).catch(() => undefined);
    }
  }

  await mkdir(dirname(newAbsPath), { recursive: true });

  const fragmentToWrite = {
    ...fragment,
    meta: {
      ...fragment.meta,
      updated: new Date().toISOString().split("T")[0],
    },
  };

  // Omit replace_blocks when empty to keep YAML files concise
  const { replace_blocks, ...baseFragment } = fragmentToWrite;
  const toWrite = replace_blocks?.length ? { ...baseFragment, replace_blocks } : baseFragment;

  await writeFile(newAbsPath, stringify(toWrite, { lineWidth: 0 }), "utf-8");
}

export async function deleteFragment(id: string): Promise<void> {
  let entry: RegistryEntry | undefined;
  try {
    const { entries } = await loadValidatedRegistry();
    entry = entries.find((e) => e.id === id);
  } catch {
    throw new Error("Registry not available");
  }
  if (!entry) throw new Error(`Fragment "${id}" not found`);

  const safeBase = resolve(FRAGMENTS_ROOT);
  const absPath = resolve(join(safeBase, entry.path));
  if (!absPath.startsWith(safeBase + sep)) throw new Error("Path traversal rejected");

  await unlink(absPath);
}

/**
 * Write a fragment and update the registry incrementally — avoids a full
 * filesystem walk. Must be called inside withWriteLock.
 *
 * @param fragment    The new or updated fragment.
 * @param previousPath  Relative path of the old file (only needed for renames
 *                      or tier moves so the stale registry entry can be removed).
 */
export async function saveFragmentAndUpdateRegistry(
  fragment: Fragment,
  previousPath?: string
): Promise<void> {
  invalidateRegistryCache();
  await saveFragment(fragment, previousPath);

  const { tiers } = await loadTiersConfig();
  const tierOrder = tiers.map((t) => t.id);

  // Read raw registry from disk (cache is null after invalidation)
  let rawEntries: RegistryEntry[] = [];
  try {
    const raw = await readFile(REGISTRY_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      for (const item of parsed as unknown[]) {
        const result = RegistryEntrySchema.safeParse(item);
        if (result.success) rawEntries.push(result.data);
      }
    }
  } catch {
    // Registry missing or corrupt — will be recreated from scratch
  }

  const newRelPath = join(fragment.tier, `${fragment.id}.yaml`).replace(/\\/g, "/");

  // Remove stale entries: old path (for renames/moves) and same id (for updates)
  const filtered = rawEntries.filter((e) => {
    if (previousPath && e.path === previousPath) return false;
    if (e.id === fragment.id) return false;
    return true;
  });

  // Build new entry
  const newEntry: RegistryEntry = {
    id: fragment.id,
    tier: fragment.tier,
    path: newRelPath,
    meta: {
      ...fragment.meta,
      updated: new Date().toISOString().split("T")[0],
    },
    depends_on: fragment.depends_on,
  };
  filtered.push(newEntry);

  // Re-sort by tier order then id
  filtered.sort((a, b) => {
    const ai = tierOrder.indexOf(a.tier);
    const bi = tierOrder.indexOf(b.tier);
    const ea = ai === -1 ? tierOrder.length : ai;
    const eb = bi === -1 ? tierOrder.length : bi;
    if (ea !== eb) return ea - eb;
    return a.id.localeCompare(b.id);
  });

  await writeFile(REGISTRY_PATH, JSON.stringify(filtered, null, 2) + "\n", "utf-8");

  // Update cache directly — next read skips disk
  _registryCache = {
    entries: filtered,
    allowedPaths: new Set(filtered.map((e) => e.path)),
  };
}

/**
 * Delete a fragment from disk and remove its entry from the registry.
 * Must be called inside withWriteLock.
 */
export async function deleteFragmentAndUpdateRegistry(id: string): Promise<void> {
  invalidateRegistryCache();
  await deleteFragment(id);

  let rawEntries: RegistryEntry[] = [];
  try {
    const raw = await readFile(REGISTRY_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) rawEntries = parsed as RegistryEntry[];
  } catch {
    // Nothing to remove from
    return;
  }

  const filtered = rawEntries.filter((e) => e.id !== id);
  await writeFile(REGISTRY_PATH, JSON.stringify(filtered, null, 2) + "\n", "utf-8");

  _registryCache = {
    entries: filtered,
    allowedPaths: new Set(filtered.map((e) => e.path)),
  };
}

export async function createTierDirectory(tierId: string): Promise<void> {
  if (!SAFE_ID_RE.test(tierId)) throw new Error(`Invalid tier id: "${tierId}"`);
  const safeBase = resolve(FRAGMENTS_ROOT);
  const tierPath = resolve(join(safeBase, tierId));
  if (!tierPath.startsWith(safeBase + sep)) throw new Error("Path traversal rejected");
  await mkdir(tierPath, { recursive: true });
}
