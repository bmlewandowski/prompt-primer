/**
 * Diff utility for comparing two text strings line-by-line.
 * Returns an array of diff lines with their type (added, removed, unchanged).
 */

export interface DiffLine {
  type: "added" | "removed" | "unchanged";
  content: string;
  lineNumber?: number; // Original line number for context
}

/**
 * Compute a line-by-line diff between two strings.
 * Uses a simple longest common subsequence (LCS) algorithm.
 */
export function computeDiff(oldText: string, newText: string): DiffLine[] {
  const oldLines = oldText.split("\n");
  const newLines = newText.split("\n");

  const lcs = computeLCS(oldLines, newLines);
  const result: DiffLine[] = [];

  let oldIndex = 0;
  let newIndex = 0;
  let lcsIndex = 0;

  while (oldIndex < oldLines.length || newIndex < newLines.length) {
    if (lcsIndex < lcs.length && oldLines[oldIndex] === lcs[lcsIndex] && newLines[newIndex] === lcs[lcsIndex]) {
      // Common line
      result.push({
        type: "unchanged",
        content: oldLines[oldIndex],
        lineNumber: oldIndex + 1,
      });
      oldIndex++;
      newIndex++;
      lcsIndex++;
    } else if (lcsIndex < lcs.length && newLines[newIndex] === lcs[lcsIndex]) {
      // Line was removed from old
      result.push({
        type: "removed",
        content: oldLines[oldIndex],
        lineNumber: oldIndex + 1,
      });
      oldIndex++;
    } else if (lcsIndex < lcs.length && oldLines[oldIndex] === lcs[lcsIndex]) {
      // Line was added to new
      result.push({
        type: "added",
        content: newLines[newIndex],
      });
      newIndex++;
    } else {
      // Check which one matches the next LCS item
      const nextLCS = lcs[lcsIndex];
      const oldHasNext = oldLines.slice(oldIndex).indexOf(nextLCS);
      const newHasNext = newLines.slice(newIndex).indexOf(nextLCS);

      if (oldHasNext === -1 && newHasNext === -1) {
        // Neither matches, treat as replace (remove old, add new)
        if (oldIndex < oldLines.length) {
          result.push({
            type: "removed",
            content: oldLines[oldIndex],
            lineNumber: oldIndex + 1,
          });
          oldIndex++;
        }
        if (newIndex < newLines.length) {
          result.push({
            type: "added",
            content: newLines[newIndex],
          });
          newIndex++;
        }
      } else if (newHasNext === -1 || (oldHasNext !== -1 && oldHasNext < newHasNext)) {
        // Old is closer to next match, so this is a removal
        result.push({
          type: "removed",
          content: oldLines[oldIndex],
          lineNumber: oldIndex + 1,
        });
        oldIndex++;
      } else {
        // New is closer, so this is an addition
        result.push({
          type: "added",
          content: newLines[newIndex],
        });
        newIndex++;
      }
    }
  }

  return result;
}

/**
 * Compute the longest common subsequence of two arrays of strings.
 * Returns the LCS as an array of strings.
 */
function computeLCS(a: string[], b: string[]): string[] {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array(m + 1)
    .fill(0)
    .map(() => Array(n + 1).fill(0));

  // Build the LCS length table
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Backtrack to find the LCS
  const lcs: string[] = [];
  let i = m;
  let j = n;
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      lcs.unshift(a[i - 1]);
      i--;
      j--;
    } else if (dp[i - 1][j] > dp[i][j - 1]) {
      i--;
    } else {
      j--;
    }
  }

  return lcs;
}
