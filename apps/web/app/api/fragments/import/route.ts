import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { FragmentSchema } from "@prompt-primer/compiler";
import type { Fragment } from "@prompt-primer/compiler";
import {
  loadValidatedRegistry,
  saveFragmentAndUpdateRegistry,
  withWriteLock,
} from "@/lib/fragmentRegistry";
import { checkWriteAuth } from "@/lib/auth";

const ImportBodySchema = z.object({
  fragments: z.array(z.unknown()).min(1, "No fragments provided"),
  /** skip = leave existing fragments untouched; overwrite = replace them */
  mode: z.enum(["skip", "overwrite"]).default("skip"),
});

export async function POST(req: NextRequest) {
  const authError = checkWriteAuth(req);
  if (authError) return authError;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = ImportBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid import payload", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { fragments: rawFragments, mode } = parsed.data;

  // Validate each fragment against the schema
  const valid: Fragment[] = [];
  const errors: Array<{ index: number; id?: string; error: string }> = [];

  for (let i = 0; i < rawFragments.length; i++) {
    const result = FragmentSchema.safeParse(rawFragments[i]);
    if (result.success) {
      valid.push(result.data);
    } else {
      const raw = rawFragments[i];
      const id =
        raw !== null &&
        typeof raw === "object" &&
        "id" in raw &&
        typeof (raw as Record<string, unknown>).id === "string"
          ? (raw as { id: string }).id
          : undefined;
      errors.push({ index: i, id, error: result.error.message });
    }
  }

  // Determine which IDs already exist
  let existingIds = new Set<string>();
  try {
    const { entries } = await loadValidatedRegistry();
    existingIds = new Set(entries.map((e) => e.id));
  } catch {
    // Registry missing — treat all as new
  }

  let imported = 0;
  let skipped = 0;

  await withWriteLock(async () => {
    for (const fragment of valid) {
      if (existingIds.has(fragment.id) && mode === "skip") {
        skipped++;
        continue;
      }
      await saveFragmentAndUpdateRegistry(fragment);
      imported++;
    }
  });

  return NextResponse.json({
    imported,
    skipped,
    ...(errors.length > 0 ? { errors } : {}),
  });
}
