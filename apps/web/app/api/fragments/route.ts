import { NextRequest, NextResponse } from "next/server";
import { FragmentSchema } from "@prompt-primer/compiler";
import {
  loadValidatedRegistry,
  saveFragmentAndUpdateRegistry,
  withWriteLock,
} from "@/lib/fragmentRegistry";
import { checkWriteAuth } from "@/lib/auth";

export async function GET(_req: NextRequest) {
  try {
    const { entries } = await loadValidatedRegistry();
    return NextResponse.json(entries);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 503 });
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

  const parsed = FragmentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid fragment data", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  // Check for duplicate id
  try {
    const { entries } = await loadValidatedRegistry();
    if (entries.some((e) => e.id === parsed.data.id)) {
      return NextResponse.json(
        { error: `Fragment id "${parsed.data.id}" already exists` },
        { status: 409 }
      );
    }
  } catch {
    // Registry might not exist yet — allow creation
  }

  try {
    await withWriteLock(async () => {
      await saveFragmentAndUpdateRegistry(parsed.data);
    });
    return NextResponse.json({ success: true, id: parsed.data.id }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
