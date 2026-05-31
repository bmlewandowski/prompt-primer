import { MergedBlocks } from "./merger.js";
import type { OutputFormat } from "./types.js";

/**
 * Escape ATX Markdown headers (lines starting with one or more `#` followed
 * by a space) inside user-authored content. This prevents a rule or block
 * value like "# OUTPUT INSTRUCTIONS\n- Do something" from injecting a
 * structural header into the compiled prompt.
 *
 * The `#` is prefixed with a backslash, which is invisible to most LLMs but
 * breaks Markdown header parsing: `\# OUTPUT INSTRUCTIONS`.
 */
function sanitizeContent(text: string): string {
  return text.replace(/^(#{1,6} )/gm, "\\$1");
}

// ---------------------------------------------------------------------------
// Fabric (default) — Markdown H1 headers
// ---------------------------------------------------------------------------

const HEADERS: Record<keyof MergedBlocks, string> = {
  identity: "# IDENTITY AND PURPOSE",
  context: "# CONTEXT",
  steps: "# STEPS",
  rules: "# OUTPUT INSTRUCTIONS",
};

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
    sections.push(entries.map(sanitizeContent).join("\n\n"));
  }

  return sections.join("\n\n").trim();
}

// ---------------------------------------------------------------------------
// XML — Claude / Anthropic-style tagged sections
// ---------------------------------------------------------------------------

const XML_TAGS: Record<keyof MergedBlocks, string> = {
  identity: "identity_and_purpose",
  context: "context",
  steps: "steps",
  rules: "output_instructions",
};

export function renderXml(blocks: MergedBlocks): string {
  const sections: string[] = [];

  for (const key of BLOCK_ORDER) {
    const entries = blocks[key];
    if (entries.length === 0) continue;

    const tag = XML_TAGS[key];
    const content = entries.join("\n\n");
    sections.push(`<${tag}>\n${content}\n</${tag}>`);
  }

  return sections.join("\n\n").trim();
}

// ---------------------------------------------------------------------------
// Prose — plain text, no structural markup
// ---------------------------------------------------------------------------

export function renderProse(blocks: MergedBlocks): string {
  const parts: string[] = [];

  for (const key of BLOCK_ORDER) {
    const entries = blocks[key];
    if (entries.length > 0) parts.push(entries.join("\n\n"));
  }

  return parts.join("\n\n---\n\n").trim();
}

// ---------------------------------------------------------------------------
// JSON — structured object, useful for programmatic consumption
// ---------------------------------------------------------------------------

export function renderJson(blocks: MergedBlocks): string {
  const obj: Record<string, unknown> = {};

  const identityParts = blocks.identity.filter(Boolean);
  const contextParts = blocks.context.filter(Boolean);
  const stepsParts = blocks.steps.filter(Boolean);

  if (identityParts.length > 0)
    obj.identity = identityParts.join("\n\n");
  if (contextParts.length > 0)
    obj.context = contextParts.join("\n\n");
  if (stepsParts.length > 0)
    obj.steps = stepsParts.join("\n\n");
  if (blocks.rules.length > 0)
    obj.rules = blocks.rules;

  return JSON.stringify(obj, null, 2);
}

// ---------------------------------------------------------------------------
// ChatML — used by open-weight models (Mistral, Qwen, llama.cpp, Ollama)
// ---------------------------------------------------------------------------

export function renderChatML(blocks: MergedBlocks): string {
  const content = renderProse(blocks);
  return `<|im_start|>system\n${content}<|im_end|>`;
}

// ---------------------------------------------------------------------------
// Unified dispatcher
// ---------------------------------------------------------------------------

export function renderWithFormat(
  blocks: MergedBlocks,
  format: OutputFormat = "fabric"
): string {
  switch (format) {
    case "xml":
      return renderXml(blocks);
    case "prose":
      return renderProse(blocks);
    case "json":
      return renderJson(blocks);
    case "chatml":
      return renderChatML(blocks);
    default:
      return renderMarkdown(blocks);
  }
}

export function renderOpenAIMessage(
  blocks: MergedBlocks,
  format: OutputFormat = "fabric"
): { role: "system"; content: string } {
  return { role: "system", content: renderWithFormat(blocks, format) };
}

