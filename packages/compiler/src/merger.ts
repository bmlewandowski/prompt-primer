import { Fragment, TIER_ORDER, ConflictResolution, ManifestFragment } from "./types.js";

// ---------------------------------------------------------------------------
// Merged block structure produced by the merger
// ---------------------------------------------------------------------------
export interface MergedBlocks {
  identity: string[];
  context: string[];
  steps: string[];
  rules: string[]; // fully resolved, ordered list of rule content strings
}

export interface MergeResult {
  blocks: MergedBlocks;
  conflictResolutions: ConflictResolution[];
  missingDependencies: Array<{ fragmentId: string; missingIds: string[] }>;
  /** Directed cycles detected within the selected fragments' depends_on graph. */
  circularDependencies: Array<{ cycle: string[] }>;
}

// ---------------------------------------------------------------------------
// Circular dependency detection
// ---------------------------------------------------------------------------
function detectCycles(fragments: Fragment[]): Array<{ cycle: string[] }> {
  const allIds = new Set(fragments.map((f) => f.id));
  const depMap = new Map<string, string[]>();
  for (const f of fragments) {
    // Only follow deps that are within the selected set
    depMap.set(f.id, f.depends_on.filter((d) => allIds.has(d)));
  }

  const cycles: Array<{ cycle: string[] }> = [];
  const seenCycleKeys = new Set<string>();
  const globalDone = new Set<string>();

  const dfs = (id: string, path: string[], pathSet: Set<string>) => {
    if (globalDone.has(id)) return;
    if (pathSet.has(id)) {
      const cycleStart = path.indexOf(id);
      const cycle = path.slice(cycleStart);
      const key = [...cycle].sort().join("\0");
      if (!seenCycleKeys.has(key)) {
        seenCycleKeys.add(key);
        cycles.push({ cycle });
      }
      return;
    }
    pathSet.add(id);
    path.push(id);
    for (const dep of depMap.get(id) ?? []) {
      dfs(dep, path, pathSet);
    }
    path.pop();
    pathSet.delete(id);
    globalDone.add(id);
  };

  for (const f of fragments) {
    dfs(f.id, [], new Set());
  }
  return cycles;
}

// ---------------------------------------------------------------------------
// Core merge logic
// ---------------------------------------------------------------------------
export function mergeFragments(
  fragments: Fragment[],
  tierOrder: readonly string[] = TIER_ORDER
): MergeResult {
  // Sort by tier priority. Unknown/custom tiers sort after all known tiers.
  const sorted = [...fragments].sort((a, b) => {
    const ai = tierOrder.indexOf(a.tier);
    const bi = tierOrder.indexOf(b.tier);
    const ea = ai === -1 ? tierOrder.length : ai;
    const eb = bi === -1 ? tierOrder.length : bi;
    return ea - eb;
  });

  const allIds = new Set(sorted.map((f) => f.id));

  // Circular dependency detection
  const circularDependencies = detectCycles(sorted);

  // Validate depends_on (flag deps not present in the selection)
  const missingDependencies: MergeResult["missingDependencies"] = [];
  for (const fragment of sorted) {
    const missing = fragment.depends_on.filter((dep) => !allIds.has(dep));
    if (missing.length > 0) {
      missingDependencies.push({ fragmentId: fragment.id, missingIds: missing });
    }
  }

  // Additive blocks: simply collect non-null content in tier order
  const identityParts: string[] = [];
  const contextParts: string[] = [];
  const stepsParts: string[] = [];

  // Rules: keyed rules use override map; unnamed rules are always appended
  // (and deduplicated by content).
  // Override priority: task > project > team > org
  // We process in tier order (org first), so later entries overwrite earlier
  // ones for the same key — this naturally implements "lower tier wins."
  const keyedRuleMap = new Map<string, { content: string; fragmentId: string }>();
  const unnamedRules: string[] = [];
  const unnamedRulesSeen = new Set<string>(); // deduplication
  const conflictResolutions: ConflictResolution[] = [];

  // Track which keyed rules came from where (to record conflict resolutions)
  const keyedRuleHistory = new Map<
    string,
    Array<{ content: string; fragmentId: string }>
  >();

  for (const fragment of sorted) {
    const { blocks, replace_blocks } = fragment;

    // replace_blocks: if this fragment claims replace on a block key,
    // clear everything accumulated from higher-priority tiers first.
    if (replace_blocks.includes("identity")) identityParts.length = 0;
    if (replace_blocks.includes("context")) contextParts.length = 0;
    if (replace_blocks.includes("steps")) stepsParts.length = 0;

    if (blocks.identity?.trim()) {
      identityParts.push(blocks.identity.trim());
    }
    if (blocks.context?.trim()) {
      contextParts.push(blocks.context.trim());
    }
    if (blocks.steps?.trim()) {
      stepsParts.push(blocks.steps.trim());
    }

    for (const rule of blocks.rules) {
      if (!rule.key) {
        // Unnamed rule — append only if this exact content hasn't been seen
        const trimmed = rule.content.trim();
        if (!unnamedRulesSeen.has(trimmed)) {
          unnamedRulesSeen.add(trimmed);
          unnamedRules.push(trimmed);
        }
      } else {
        // Named rule — track history and overwrite (lower tier wins due to sort order)
        const history = keyedRuleHistory.get(rule.key) ?? [];
        history.push({ content: rule.content.trim(), fragmentId: fragment.id });
        keyedRuleHistory.set(rule.key, history);
        keyedRuleMap.set(rule.key, {
          content: rule.content.trim(),
          fragmentId: fragment.id,
        });
      }
    }
  }

  // Build conflict resolution log for keyed rules that had more than one contributor
  for (const [key, history] of keyedRuleHistory.entries()) {
    if (history.length > 1) {
      const winner = keyedRuleMap.get(key)!;
      conflictResolutions.push({
        key,
        winner: winner.fragmentId,
        overrode: history
          .filter((h) => h.fragmentId !== winner.fragmentId)
          .map((h) => h.fragmentId),
      });
    }
  }

  // Final rules list: keyed rules (in original encounter order) + unnamed rules
  const keyedRuleContents = [...keyedRuleMap.values()].map((r) => r.content);
  const resolvedRules = [...keyedRuleContents, ...unnamedRules];

  return {
    blocks: {
      identity: identityParts,
      context: contextParts,
      steps: stepsParts,
      rules: resolvedRules,
    },
    conflictResolutions,
    missingDependencies,
    circularDependencies,
  };
}

export function buildManifestFragments(
  fragments: Fragment[],
  paths: string[]
): ManifestFragment[] {
  return fragments.map((f, i) => ({
    id: f.id,
    tier: f.tier,
    version: f.meta.version,
    path: paths[i] ?? "",
  }));
}
