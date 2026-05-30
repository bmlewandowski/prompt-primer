import { readFile } from "fs/promises";
import { parse } from "yaml";
import { z } from "zod";
import { Fragment, FragmentSchema } from "./types.js";

export class FragmentLoadError extends Error {
  constructor(
    public readonly path: string,
    cause: unknown
  ) {
    const message =
      cause instanceof z.ZodError
        ? `Schema validation failed for "${path}":\n${cause.errors
            .map((e) => `  ${e.path.join(".")} — ${e.message}`)
            .join("\n")}`
        : `Failed to load fragment "${path}": ${String(cause)}`;
    super(message);
    this.name = "FragmentLoadError";
  }
}

export async function loadFragment(absolutePath: string): Promise<Fragment> {
  let raw: string;
  try {
    raw = await readFile(absolutePath, "utf-8");
  } catch (cause) {
    throw new FragmentLoadError(absolutePath, cause);
  }

  let parsed: unknown;
  try {
    parsed = parse(raw);
  } catch (cause) {
    throw new FragmentLoadError(
      absolutePath,
      `YAML parse error: ${String(cause)}`
    );
  }

  const result = FragmentSchema.safeParse(parsed);
  if (!result.success) {
    throw new FragmentLoadError(absolutePath, result.error);
  }

  return result.data;
}

export async function loadFragments(
  absolutePaths: string[]
): Promise<Fragment[]> {
  return Promise.all(absolutePaths.map(loadFragment));
}
