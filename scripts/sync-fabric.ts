#!/usr/bin/env tsx
/**
 * Fabric Sync Script
 *
 * Fetches patterns from the public Fabric repository and converts them to
 * the prompt-primer YAML fragment format stored in packages/fragments/task/fabric/.
 *
 * Usage:
 *   pnpm sync-fabric                             # sync default pattern list
 *   pnpm sync-fabric --patterns analyze_code,extract_wisdom
 *   pnpm sync-fabric --all                       # attempt to sync every pattern
 *   pnpm sync-fabric --commit abc1234            # pin to a specific Fabric commit
 *
 * Each Fabric pattern (data/patterns/<name>/system.md) is fetched from GitHub
 * raw content and its Markdown sections are mapped to the fragment YAML schema.
 */
import { writeFile, mkdir, readFile } from "fs/promises";
import { join } from "path";
import { existsSync } from "fs";
import { createHash } from "crypto";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
const FABRIC_RAW_BASE =
  "https://raw.githubusercontent.com/danielmiessler/fabric/main/data/patterns";

const FABRIC_API_BASE =
  "https://api.github.com/repos/danielmiessler/fabric/contents/data/patterns";

const FRAGMENTS_FABRIC_DIR = join(
  import.meta.dirname,
  "../packages/fragments/task/fabric"
);

const LOCK_PATH = join(
  import.meta.dirname,
  "../packages/fragments/task/fabric/fabric.lock.json"
);

// Default curated patterns — subset known to be high-quality and broadly useful
const DEFAULT_PATTERNS = [
  "analyze_code",
  "create_threat_model",
  "extract_wisdom",
  "summarize",
  "write_essay",
  "create_design_document",
  "explain_code",
  "find_logical_fallacies",
  "improve_writing",
  "create_user_story",
];

// Pattern names must be lowercase alphanumeric + underscore/hyphen only.
// This is validated before interpolating into URLs.
const SAFE_PATTERN_RE = /^[a-z0-9_-]+$/;

// ---------------------------------------------------------------------------
// Fabric Markdown section → fragment block key mapping
// ---------------------------------------------------------------------------
const SECTION_MAP: Record<string, keyof typeof BLOCK_KEYS> = {
  "identity and purpose": "identity",
  "identity": "identity",
  "context": "context",
  "steps": "steps",
  "output": "rules",
  "output instructions": "rules",
};
const BLOCK_KEYS = {
  identity: true,
  context: true,
  steps: true,
  rules: true,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": "prompt-primer-sync/1.0" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  return res.text();
}

interface ParsedSections {
  identity: string;
  context: string;
  steps: string;
  rules: string;
}

function parseSystemMd(content: string): ParsedSections {
  const result: ParsedSections = {
    identity: "",
    context: "",
    steps: "",
    rules: "",
  };

  // Split on top-level Markdown H1/H2 headers
  const headerRegex = /^#{1,2}\s+(.+)$/gm;
  const sections: Array<{ heading: string; body: string }> = [];
  let lastIndex = 0;
  let lastHeading = "";

  let match: RegExpExecArray | null;
  while ((match = headerRegex.exec(content)) !== null) {
    if (lastHeading) {
      sections.push({
        heading: lastHeading,
        body: content.slice(lastIndex, match.index).trim(),
      });
    }
    lastHeading = match[1];
    lastIndex = match.index + match[0].length;
  }
  if (lastHeading) {
    sections.push({ heading: lastHeading, body: content.slice(lastIndex).trim() });
  }

  for (const { heading, body } of sections) {
    const normalizedHeading = heading.toLowerCase().trim();
    const blockKey = SECTION_MAP[normalizedHeading];
    if (blockKey && body) {
      // Append if multiple sections map to the same block (e.g., two output sections)
      result[blockKey] = result[blockKey]
        ? `${result[blockKey]}\n\n${body}`
        : body;
    }
  }

  return result;
}

function slugToId(patternName: string): string {
  return `fabric_${patternName.replace(/-/g, "_")}`;
}

function buildYaml(patternName: string, sections: ParsedSections, commitSha: string): string {
  const id = slugToId(patternName);
  const rulesYaml = sections.rules
    ? `  rules:\n    - content: |\n        ${sections.rules.replace(/\n/g, "\n        ")}`
    : "  rules: []";

  const formatBlock = (key: keyof ParsedSections, yamlKey: string): string => {
    const val = sections[key];
    if (!val) return `  ${yamlKey}: null`;
    const indented = val.replace(/\n/g, "\n    ");
    return `  ${yamlKey}: |\n    ${indented}`;
  };

  return [
    `id: ${id}`,
    `tier: task`,
    `meta:`,
    `  version: "1.0.0"`,
    `  description: "Fabric pattern: ${patternName} (synced from danielmiessler/fabric@${commitSha.slice(0, 7)})"`,
    `  tags: [fabric, task, ${patternName.replace(/_/g, "-")}]`,
    `  author: fabric-sync`,
    `  updated: "${new Date().toISOString().slice(0, 10)}"`,
    `  fabric_source: "${patternName}"`,
    `depends_on: []`,
    `blocks:`,
    formatBlock("identity", "identity"),
    formatBlock("context", "context"),
    formatBlock("steps", "steps"),
    rulesYaml,
    "",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function getLatestCommitSha(): Promise<string> {
  const res = await fetch(
    "https://api.github.com/repos/danielmiessler/fabric/commits/main?per_page=1",
    { headers: { "User-Agent": "prompt-primer-sync/1.0" } }
  );
  if (!res.ok) return "unknown";
  const data = await res.json() as { sha?: string };
  return data.sha ?? "unknown";
}

async function listAllPatterns(): Promise<string[]> {
  const res = await fetch(FABRIC_API_BASE, {
    headers: { "User-Agent": "prompt-primer-sync/1.0" },
  });
  if (!res.ok) throw new Error(`Cannot list patterns: HTTP ${res.status}`);
  const items = await res.json() as Array<{ name: string; type: string }>;
  return items.filter((i) => i.type === "dir").map((i) => i.name);
}

async function main() {
  const args = process.argv.slice(2);
  const syncAll = args.includes("--all");
  const commitArg = args.find((a) => a.startsWith("--commit="))?.split("=")[1];
  const patternsArg = args.find((a) => a.startsWith("--patterns="))?.split("=")[1];

  const commitSha = commitArg ?? (await getLatestCommitSha());
  let patterns: string[];

  if (syncAll) {
    console.log("Fetching full pattern list from Fabric repository...");
    patterns = await listAllPatterns();
    console.log(`Found ${patterns.length} patterns.`);
  } else if (patternsArg) {
    patterns = patternsArg.split(",").map((p) => p.trim());
  } else {
    patterns = DEFAULT_PATTERNS;
  }

  await mkdir(FRAGMENTS_FABRIC_DIR, { recursive: true });

  const lock: Record<string, { commitSha: string; syncedAt: string; sha256?: string }> = existsSync(
    LOCK_PATH
  )
    ? JSON.parse(await readFile(LOCK_PATH, "utf-8"))
    : {};

  let synced = 0;
  let skipped = 0;
  let failed = 0;

  for (const patternName of patterns) {
    // Reject any pattern name that could be used for URL manipulation or path traversal
    if (!SAFE_PATTERN_RE.test(patternName)) {
      console.error(`  skip  "${patternName}" — invalid pattern name (must match ${SAFE_PATTERN_RE})`);
      failed++;
      continue;
    }

    const url = `${FABRIC_RAW_BASE}/${patternName}/system.md`;
    const outPath = join(FRAGMENTS_FABRIC_DIR, `${patternName}.yaml`);

    // Skip if already synced at same commit AND on-disk content hash matches lock
    const lockEntry = lock[patternName];
    if (lockEntry?.commitSha === commitSha && existsSync(outPath)) {
      if (lockEntry.sha256) {
        const onDisk = await readFile(outPath, "utf-8");
        const onDiskHash = createHash("sha256").update(onDisk, "utf-8").digest("hex");
        if (onDiskHash !== lockEntry.sha256) {
          console.warn(`  warn  ${patternName}: on-disk content hash mismatch — re-syncing`);
          // fall through to re-sync
        } else {
          console.log(`  skip  ${patternName} (already at ${commitSha.slice(0, 7)})`);
          skipped++;
          continue;
        }
      } else {
        console.log(`  skip  ${patternName} (already at ${commitSha.slice(0, 7)})`);
        skipped++;
        continue;
      }
    }

    try {
      const systemMd = await fetchText(url);
      const sections = parseSystemMd(systemMd);
      const yaml = buildYaml(patternName, sections, commitSha);
      await writeFile(outPath, yaml, "utf-8");
      const sha256 = createHash("sha256").update(yaml, "utf-8").digest("hex");
      lock[patternName] = { commitSha, syncedAt: new Date().toISOString(), sha256 };
      console.log(`  sync  ${patternName}`);
      synced++;
    } catch (err) {
      console.error(`  fail  ${patternName}: ${String(err)}`);
      failed++;
    }
  }

  await writeFile(LOCK_PATH, JSON.stringify(lock, null, 2), "utf-8");

  console.log(`\nDone: ${synced} synced, ${skipped} skipped, ${failed} failed`);
  console.log(`Commit: ${commitSha}`);
  console.log("\nRun `pnpm generate-registry` to update the fragment index.");

  if (failed > 0) process.exit(1);
}

main();
