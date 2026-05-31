import { NextRequest, NextResponse } from "next/server";
import { loadFragmentHistory, getFragmentRevision } from "@/lib/fragmentHistory";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/fragments/[id]/history
 * Returns all revisions for a fragment, newest first.
 */
export async function GET(_req: NextRequest, { params }: RouteContext) {
  const { id } = await params;

  try {
    const history = await loadFragmentHistory(id);
    return NextResponse.json({ history });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
