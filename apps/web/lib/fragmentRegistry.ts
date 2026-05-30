import { readFile } from "fs/promises";
import { join } from "path";
import { RegistryEntrySchema } from "@prompt-primer/compiler";
import type { RegistryEntry } from "@prompt-primer/compiler";

export const FRAGMENTS_ROOT =
  process.env.FRAGMENTS_ROOT ?? join(process.cwd(), "../../packages/fragments");

const REGISTRY_PATH = join(FRAGMENTS_ROOT, ".registry.json");

/**
 * Reads .registry.json and validates every entry against RegistryEntrySchema.
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

  return {
    entries,
    allowedPaths: new Set(entries.map((e) => e.path)),
  };
}
