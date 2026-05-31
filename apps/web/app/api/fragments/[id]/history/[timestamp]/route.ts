import { NextRequest, NextResponse } from "next/server";
import { getFragmentRevision } from "@/lib/fragmentHistory";
import { saveFragmentAndUpdateRegistry, withWriteLock } from "@/lib/fragmentRegistry";
import { checkWriteAuth } from "@/lib/auth";

type RouteContext = { params: Promise<{ id: string; timestamp: string }> };

/**
 * GET /api/fragments/[id]/history/[timestamp]
 * Returns a specific revision by timestamp.
 */
export async function GET(_req: NextRequest, { params }: RouteContext) {
  const { id, timestamp } = await params;

  try {
    const revision = await getFragmentRevision(id, timestamp);
    if (!revision) {
      return NextResponse.json({ error: "Revision not found" }, { status: 404 });
    }
    return NextResponse.json(revision);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * POST /api/fragments/[id]/history/[timestamp]/restore
 * Restores a specific revision as the current version.
 */
export async function POST(req: NextRequest, { params }: RouteContext) {
  const authError = checkWriteAuth(req);
  if (authError) return authError;

  const { id, timestamp } = await params;

  try {
    const revision = await getFragmentRevision(id, timestamp);
    if (!revision) {
      return NextResponse.json({ error: "Revision not found" }, { status: 404 });
    }

    await withWriteLock(async () => {
      await saveFragmentAndUpdateRegistry(revision.fragment);
    });

    return NextResponse.json({ success: true, fragment: revision.fragment });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
