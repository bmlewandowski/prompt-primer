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

async function* walkYaml(dir: string): AsyncGenerator<string> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walkYaml(fullPath);
    } else if (entry.isFile() && entry.name.endsWith(".yaml")) {
      yield fullPath;
    }
  }
}

async function main() {
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

  // Sort by tier priority then alphabetically by id
  registry.sort((a, b) => {
    const tierDiff =
      TIER_ORDER.indexOf(a.tier as (typeof TIER_ORDER)[number]) -
      TIER_ORDER.indexOf(b.tier as (typeof TIER_ORDER)[number]);
    return tierDiff !== 0 ? tierDiff : a.id.localeCompare(b.id);
  });

  await writeFile(REGISTRY_PATH, JSON.stringify(registry, null, 2), "utf-8");
  console.log(
    `Registry written: ${registry.length} fragment(s) → .registry.json`
  );
}

main();
