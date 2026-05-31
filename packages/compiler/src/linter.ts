import type { Fragment } from "./types.js";

export interface LintWarning {
  severity: "error" | "warning" | "info";
  fragmentId: string;
  category: "identity" | "rules" | "structure" | "consistency";
  message: string;
  suggestion?: string;
}

/**
 * Vague words that indicate a non-specific identity
 */
const VAGUE_WORDS = [
  "help", "assist", "support", "provide", "offer",
  "general", "various", "multiple", "different",
  "things", "stuff", "anything", "everything",
];

/**
 * Words that often signal contradictions when paired
 */
const CONTRADICTION_PAIRS = [
  ["always", "never"],
  ["must", "optional"],
  ["required", "skip"],
  ["verbose", "concise"],
  ["detailed", "brief"],
  ["formal", "casual"],
];

/**
 * Count words in a string
 */
function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Check if identity block is too vague
 */
function lintIdentity(fragment: Fragment): LintWarning[] {
  const warnings: LintWarning[] = [];
  
  if (!fragment.blocks.identity) {
    return warnings;
  }

  const identity = fragment.blocks.identity.toLowerCase();
  const wordCount = countWords(fragment.blocks.identity);

  // Check for vague words
  const foundVagueWords = VAGUE_WORDS.filter(word => 
    identity.includes(word)
  );

  if (foundVagueWords.length >= 3) {
    warnings.push({
      severity: "warning",
      fragmentId: fragment.id,
      category: "identity",
      message: `Identity contains multiple vague words: ${foundVagueWords.join(", ")}`,
      suggestion: "Be more specific about the AI's role, expertise, and purpose. Replace generic terms with concrete capabilities.",
    });
  }

  // Check if identity is too short
  if (wordCount < 10) {
    warnings.push({
      severity: "warning",
      fragmentId: fragment.id,
      category: "identity",
      message: `Identity is very short (${wordCount} words)`,
      suggestion: "Expand the identity to clearly state: who the AI is, what expertise it has, and what it exists to accomplish.",
    });
  }

  // Check for missing "current state" / "ideal state" in context-heavy fragments
  if (fragment.blocks.context && countWords(fragment.blocks.context) > 50) {
    const context = fragment.blocks.context.toLowerCase();
    const hasCurrentState = /current\s+state|right\s+now|as\s+of/.test(context);
    const hasIdealState = /ideal\s+state|goal|destination|success\s+looks/.test(context);

    if (!hasCurrentState || !hasIdealState) {
      warnings.push({
        severity: "info",
        fragmentId: fragment.id,
        category: "identity",
        message: "Context block lacks explicit current state → ideal state transition",
        suggestion: "Consider adding 'Current state:' and 'Ideal state:' labels to align with Telos principles.",
      });
    }
  }

  return warnings;
}

/**
 * Check rules for issues
 */
function lintRules(fragment: Fragment): LintWarning[] {
  const warnings: LintWarning[] = [];
  
  if (!fragment.blocks.rules || fragment.blocks.rules.length === 0) {
    return warnings;
  }

  const rules = fragment.blocks.rules;

  // Check for too many rules
  if (rules.length > 5) {
    warnings.push({
      severity: "info",
      fragmentId: fragment.id,
      category: "structure",
      message: `Fragment has ${rules.length} rules (recommended: ≤5)`,
      suggestion: "Consider splitting into multiple fragments by concern. Each fragment should have a single, focused responsibility.",
    });
  }

  // Check each rule for length
  rules.forEach((rule, idx) => {
    const content = rule.content;
    const wordCount = countWords(content);

    if (wordCount > 200) {
      warnings.push({
        severity: "warning",
        fragmentId: fragment.id,
        category: "rules",
        message: `Rule ${idx + 1} is very long (${wordCount} words)`,
        suggestion: "Break long rules into multiple focused rules, or move detailed context to the 'steps' or 'context' block.",
      });
    }
  });

  return warnings;
}

/**
 * Check for contradictory rules across fragments
 */
function lintConsistency(fragments: Fragment[]): LintWarning[] {
  const warnings: LintWarning[] = [];
  
  // Collect all rules with their fragment IDs
  const allRules: Array<{ fragmentId: string; content: string; key?: string }> = [];
  
  for (const fragment of fragments) {
    if (fragment.blocks.rules) {
      for (const rule of fragment.blocks.rules) {
        allRules.push({
          fragmentId: fragment.id,
          content: rule.content.toLowerCase(),
          key: rule.key,
        });
      }
    }
  }

  // Check for contradictions
  for (let i = 0; i < allRules.length; i++) {
    for (let j = i + 1; j < allRules.length; j++) {
      const rule1 = allRules[i];
      const rule2 = allRules[j];

      // Skip if same fragment
      if (rule1.fragmentId === rule2.fragmentId) continue;

      // Check for contradiction pairs
      for (const [word1, word2] of CONTRADICTION_PAIRS) {
        const has1in1 = rule1.content.includes(word1);
        const has2in1 = rule1.content.includes(word2);
        const has1in2 = rule2.content.includes(word1);
        const has2in2 = rule2.content.includes(word2);

        // If rule1 has word1 and rule2 has word2 (or vice versa)
        if ((has1in1 && has2in2) || (has2in1 && has1in2)) {
          warnings.push({
            severity: "warning",
            fragmentId: rule1.fragmentId,
            category: "consistency",
            message: `Potential contradiction with ${rule2.fragmentId}`,
            suggestion: `Rules contain opposing terms ('${word1}' vs '${word2}'). Review both fragments to ensure they don't conflict.`,
          });
          break; // Only report once per pair
        }
      }

      // Check for keyed rules with same key but different content
      if (rule1.key && rule2.key && rule1.key === rule2.key) {
        if (rule1.content !== rule2.content) {
          // This is expected behavior - lower tiers override
          // But we can inform the user
          warnings.push({
            severity: "info",
            fragmentId: rule2.fragmentId,
            category: "consistency",
            message: `Rule '${rule2.key}' overrides ${rule1.fragmentId}`,
            suggestion: "This is expected behavior. Lower-tier fragments override higher-tier keyed rules.",
          });
        }
      }
    }
  }

  return warnings;
}

/**
 * Lint a collection of fragments
 */
export function lintFragments(fragments: Fragment[]): LintWarning[] {
  const warnings: LintWarning[] = [];

  // Lint each fragment individually
  for (const fragment of fragments) {
    warnings.push(...lintIdentity(fragment));
    warnings.push(...lintRules(fragment));
  }

  // Lint consistency across fragments
  warnings.push(...lintConsistency(fragments));

  // Sort by severity
  return warnings.sort((a, b) => {
    const severityOrder = { error: 0, warning: 1, info: 2 };
    return severityOrder[a.severity] - severityOrder[b.severity];
  });
}
