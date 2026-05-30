import { NextRequest, NextResponse } from "next/server";
import { loadValidatedRegistry } from "@/lib/fragmentRegistry";

export async function GET(_req: NextRequest) {
  try {
    const { entries } = await loadValidatedRegistry();
    return NextResponse.json(entries);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
