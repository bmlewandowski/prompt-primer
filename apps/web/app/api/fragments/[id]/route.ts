import { NextRequest, NextResponse } from "next/server";
import { FragmentSchema } from "@prompt-primer/compiler";
import {
  getFragmentById,
  saveFragmentAndUpdateRegistry,
  deleteFragmentAndUpdateRegistry,
  loadValidatedRegistry,
  withWriteLock,
} from "@/lib/fragmentRegistry";
import { appendFragmentHistory, deleteFragmentHistory } from "@/lib/fragmentHistory";
import { checkWriteAuth } from "@/lib/auth";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: RouteContext) {
  const { id } = await params;

  const fragment = await getFragmentById(id);
  if (!fragment) {
    return NextResponse.json({ error: `Fragment "${id}" not found` }, { status: 404 });
  }
  return NextResponse.json(fragment);
}

export async function PUT(req: NextRequest, { params }: RouteContext) {
  const authError = checkWriteAuth(req);
  if (authError) return authError;

  const { id: pathId } = await params;

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

  // Find the current path in registry so we can detect file moves
  let previousPath: string | undefined;
  try {
    const { entries } = await loadValidatedRegistry();
    previousPath = entries.find((e) => e.id === pathId)?.path;
  } catch {
    // Registry might be stale — proceed without previousPath
  }

  try {
    await withWriteLock(async () => {
      // Save current version to history before updating
      const currentFragment = await getFragmentById(pathId);
      if (currentFragment) {
        await appendFragmentHistory(pathId, currentFragment, "Pre-update snapshot");
      }
      
      await saveFragmentAndUpdateRegistry(parsed.data, previousPath);
    });
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: RouteContext) {
  const authError = checkWriteAuth(_req);
  if (authError) return authError;

  const { id } = await params;

  try {
    await withWriteLock(async () => {
      // Delete history when fragment is deleted
      await deleteFragmentHistory(id);
      await deleteFragmentAndUpdateRegistry(id);
    });
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
