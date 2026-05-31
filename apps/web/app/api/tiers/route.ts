import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  loadTiersConfig,
  saveTiersConfig,
  createTierDirectory,
  withWriteLock,
} from "@/lib/fragmentRegistry";
import { checkWriteAuth } from "@/lib/auth";

const TierConfigSchema = z.object({
  id: z
    .string()
    .regex(/^[a-z0-9_-]+$/, "Tier id must be lowercase alphanumeric with underscores/hyphens"),
  label: z.string().min(1, "Label cannot be empty"),
});

const TiersBodySchema = z.object({
  tiers: z.array(TierConfigSchema).min(1, "At least one tier is required"),
});

export async function GET() {
  try {
    const config = await loadTiersConfig();
    return NextResponse.json(config);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const authError = checkWriteAuth(req);
  if (authError) return authError;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = TiersBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid tiers config", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    await withWriteLock(async () => {
      for (const tier of parsed.data.tiers) {
        await createTierDirectory(tier.id);
      }
      await saveTiersConfig(parsed.data);
    });
    return NextResponse.json(parsed.data);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
