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
}

// ---------------------------------------------------------------------------
// Core merge logic
// ---------------------------------------------------------------------------
export function mergeFragments(fragments: Fragment[]): MergeResult {
  // Sort fragments by tier priority: org → department → team → project → task
  // Within the same tier, preserve the order they were passed in.
  const sorted = [...fragments].sort(
    (a, b) => TIER_ORDER.indexOf(a.tier) - TIER_ORDER.indexOf(b.tier)
  );

  const allIds = new Set(sorted.map((f) => f.id));

  // Validate depends_on
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

  // Rules: keyed rules use override map; unnamed rules are always appended.
  // Override priority: task > project > team > org
  // We process in tier order (org first), so later entries overwrite earlier
  // ones for the same key — this naturally implements "lower tier wins."
  const keyedRuleMap = new Map<string, { content: string; fragmentId: string }>();
  const unnamedRules: string[] = [];
  const conflictResolutions: ConflictResolution[] = [];

  // Track which keyed rules came from where (to record conflict resolutions)
  const keyedRuleHistory = new Map<
    string,
    Array<{ content: string; fragmentId: string }>
  >();

  for (const fragment of sorted) {
    const { blocks } = fragment;

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
        // Unnamed rule — always append
        unnamedRules.push(rule.content.trim());
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
