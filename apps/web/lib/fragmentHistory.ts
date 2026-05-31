import { promises as fs } from "fs";
import { join, dirname } from "path";
import type { Fragment } from "@prompt-primer/compiler";

/**
 * Revision history stored as JSON Lines (.jsonl) — one file per fragment.
 * Each line is a JSON object representing a historical version.
 */

function getHistoryRoot(): string {
  return process.env.HISTORY_ROOT || 
    join(process.cwd(), "packages/fragments/.registry-history");
}

export const HISTORY_ROOT = getHistoryRoot();

export interface FragmentRevision {
  /** ISO timestamp of when this version was saved */
  timestamp: string;
  /** The complete fragment content at this point in time */
  fragment: Fragment;
  /** Optional note about the change (future: could track user, reason, etc.) */
  note?: string;
}

/**
 * Append a fragment revision to its history file.
 * Creates the .registry-history directory and fragment-specific .jsonl file if needed.
 */
export async function appendFragmentHistory(
  fragmentId: string,
  fragment: Fragment,
  note?: string
): Promise<void> {
  const revision: FragmentRevision = {
    timestamp: new Date().toISOString(),
    fragment,
    note,
  };

  const historyFile = join(getHistoryRoot(), `${fragmentId}.jsonl`);
  
  // Ensure directory exists
  await fs.mkdir(dirname(historyFile), { recursive: true });

  // Append as a single line of JSON
  const line = JSON.stringify(revision) + "\n";
  await fs.appendFile(historyFile, line, "utf-8");
}

/**
 * Load all revisions for a fragment, newest first.
 * Returns empty array if no history exists.
 */
export async function loadFragmentHistory(fragmentId: string): Promise<FragmentRevision[]> {
  const historyFile = join(getHistoryRoot(), `${fragmentId}.jsonl`);
  
  let content: string;
  try {
    content = await fs.readFile(historyFile, "utf-8");
  } catch (err) {
    // History file doesn't exist yet
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw err;
  }

  const lines = content.trim().split("\n").filter(Boolean);
  const revisions: FragmentRevision[] = [];

  for (const line of lines) {
    try {
      const parsed = JSON.parse(line) as FragmentRevision;
      revisions.push(parsed);
    } catch {
      // Skip malformed lines
      continue;
    }
  }

  // Return newest first
  return revisions.reverse();
}

/**
 * Get a specific revision by timestamp.
 * Returns null if not found.
 */
export async function getFragmentRevision(
  fragmentId: string,
  timestamp: string
): Promise<FragmentRevision | null> {
  const history = await loadFragmentHistory(fragmentId);
  return history.find((rev) => rev.timestamp === timestamp) || null;
}

/**
 * Delete all history for a fragment (called when fragment is deleted).
 */
export async function deleteFragmentHistory(fragmentId: string): Promise<void> {
  const historyFile = join(getHistoryRoot(), `${fragmentId}.jsonl`);
  
  try {
    await fs.unlink(historyFile);
  } catch (err) {
    // Ignore if file doesn't exist
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      throw err;
    }
  }
}
