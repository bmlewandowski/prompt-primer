#!/usr/bin/env tsx
/**
 * Validates every YAML fragment in the library against the FragmentSchema.
 * Exits with code 1 if any fragment fails validation — suitable for CI.
 */
import { readdir, readFile } from "fs/promises";
import { join } from "path";
import { parse } from "yaml";
import { FragmentSchema } from "@prompt-primer/compiler";

const FRAGMENTS_ROOT = join(import.meta.dirname, "..");

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
  let passed = 0;
  let failed = 0;

  for await (const filePath of walkYaml(FRAGMENTS_ROOT)) {
    try {
      const raw = await readFile(filePath, "utf-8");
      const parsed = parse(raw);
      FragmentSchema.parse(parsed);
      console.log(`✓  ${filePath.replace(FRAGMENTS_ROOT + "/", "")}`);
      passed++;
    } catch (err) {
      console.error(`✗  ${filePath.replace(FRAGMENTS_ROOT + "/", "")}`);
      console.error(`   ${String(err)}\n`);
      failed++;
    }
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main();
