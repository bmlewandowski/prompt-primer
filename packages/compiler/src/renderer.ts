import { MergedBlocks } from "./merger.js";

// Fabric-style Markdown header labels
const HEADERS: Record<keyof MergedBlocks, string> = {
  identity: "# IDENTITY AND PURPOSE",
  context: "# CONTEXT",
  steps: "# STEPS",
  rules: "# OUTPUT INSTRUCTIONS",
};

// Block ordering for deterministic output
const BLOCK_ORDER: Array<keyof MergedBlocks> = [
  "identity",
  "context",
  "steps",
  "rules",
];

export function renderMarkdown(blocks: MergedBlocks): string {
  const sections: string[] = [];

  for (const key of BLOCK_ORDER) {
    const entries = blocks[key];
    if (entries.length === 0) continue;

    sections.push(HEADERS[key]);
    sections.push(entries.join("\n\n"));
  }

  return sections.join("\n\n").trim();
}

export function renderOpenAIMessage(
  blocks: MergedBlocks
): { role: "system"; content: string } {
  return { role: "system", content: renderMarkdown(blocks) };
}
