#!/usr/bin/env tsx
/**
 * Scans the fragments directory and writes .registry.json — the index used
 * by the web app to discover available fragments without loading all YAML.
 */
import { readdir, readFile, writeFile } from "fs/promises";
import { join, relative } from "path";
import { parse } from "yaml";
import { RegistryEntrySchema, TIER_ORDER } from "@prompt-primer/compiler";
import type { RegistryEntry } from "@prompt-primer/compiler";

const FRAGMENTS_ROOT = join(import.meta.dirname, "..");
const REGISTRY_PATH = join(FRAGMENTS_ROOT, ".registry.json");
const TIERS_CONFIG_PATH = join(FRAGMENTS_ROOT, "tiers.json");

/**
 * Load tier order from tiers.json if present; fall back to TIER_ORDER.
 * This keeps the CLI in sync with the web app's runtime tier configuration.
 */
async function loadTierOrder(): Promise<string[]> {
  try {
    const raw = await readFile(TIERS_CONFIG_PATH, "utf-8");
    const parsed = JSON.parse(raw) as { tiers?: Array<{ id: string }> };
    if (Array.isArray(parsed?.tiers) && parsed.tiers.length > 0) {
      return parsed.tiers.map((t) => t.id);
    }
  } catch {
    // File missing or malformed — fall through to default
  }
  return [...TIER_ORDER];
}

async function* walkYaml(dir: string): AsyncGenerator<string> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      // Skip hidden directories and the scripts/ directory (not fragment content)
      if (!entry.name.startsWith(".") && entry.name !== "scripts") {
        yield* walkYaml(fullPath);
      }
    } else if (entry.isFile() && entry.name.endsWith(".yaml")) {
      yield fullPath;
    }
  }
}

async function main() {
  const tierOrder = await loadTierOrder();
  const registry: RegistryEntry[] = [];
  const errors: string[] = [];

  for await (const filePath of walkYaml(FRAGMENTS_ROOT)) {
    const rel = relative(FRAGMENTS_ROOT, filePath);
    try {
      const raw = await readFile(filePath, "utf-8");
      const parsed = parse(raw);
      const entry = RegistryEntrySchema.parse({
        id: parsed.id,
        tier: parsed.tier,
        path: rel,
        meta: parsed.meta,
        depends_on: parsed.depends_on ?? [],
      });
      registry.push(entry);
    } catch (err) {
      errors.push(`  ${rel}: ${String(err)}`);
    }
  }

  if (errors.length > 0) {
    console.error("Registry generation failed — fix these fragments first:\n");
    errors.forEach((e) => console.error(e));
    process.exit(1);
  }

  // Sort by tier priority (from tiers.json, or TIER_ORDER fallback) then alphabetically by id.
  // Unknown tiers sort after all known tiers.
  registry.sort((a, b) => {
    const ai = tierOrder.indexOf(a.tier);
    const bi = tierOrder.indexOf(b.tier);
    const ea = ai === -1 ? tierOrder.length : ai;
    const eb = bi === -1 ? tierOrder.length : bi;
    return ea !== eb ? ea - eb : a.id.localeCompare(b.id);
  });

  await writeFile(REGISTRY_PATH, JSON.stringify(registry, null, 2) + "\n", "utf-8");
  console.log(
    `Registry written: ${registry.length} fragment(s) → .registry.json`
  );
}

main();
