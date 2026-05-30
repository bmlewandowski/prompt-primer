import { z } from "zod";

// ---------------------------------------------------------------------------
// Tier ordering — lower index = higher authority, lower tier wins on override
// ---------------------------------------------------------------------------
export const TIER_ORDER = ["org", "department", "team", "project", "persona", "task"] as const;
export type Tier = (typeof TIER_ORDER)[number];

// ---------------------------------------------------------------------------
// Rule entry — unnamed rules are always additive; named rules support override
// ---------------------------------------------------------------------------
export const RuleSchema = z.object({
  key: z.string().optional(),
  content: z.string().min(1, "Rule content cannot be empty"),
});
export type Rule = z.infer<typeof RuleSchema>;

// ---------------------------------------------------------------------------
// Blocks — the structural body of a fragment, maps to Fabric topology headers
// ---------------------------------------------------------------------------
export const BlocksSchema = z.object({
  identity: z.string().nullish(),
  context: z.string().nullish(),
  steps: z.string().nullish(),
  rules: z.array(RuleSchema).default([]),
});
export type Blocks = z.infer<typeof BlocksSchema>;

// ---------------------------------------------------------------------------
// Fragment meta — version control and discoverability metadata
// ---------------------------------------------------------------------------
export const FragmentMetaSchema = z.object({
  version: z
    .string()
    .regex(/^\d+\.\d+\.\d+$/, "version must be semver (e.g. 1.0.0)"),
  description: z.string(),
  tags: z.array(z.string()).default([]),
  author: z.string().default("unknown"),
  updated: z.string(), // ISO date string
  fabric_source: z.string().nullable().default(null),
});
export type FragmentMeta = z.infer<typeof FragmentMetaSchema>;

// ---------------------------------------------------------------------------
// Fragment — a single YAML file in the library
// ---------------------------------------------------------------------------
export const FragmentSchema = z.object({
  id: z
    .string()
    .regex(
      /^[a-z0-9_-]+$/,
      "id must be lowercase alphanumeric with underscores/hyphens"
    ),
  tier: z.enum(["org", "department", "team", "project", "persona", "task"]),
  meta: FragmentMetaSchema,
  depends_on: z.array(z.string()).default([]),
  blocks: BlocksSchema,
});
export type Fragment = z.infer<typeof FragmentSchema>;

// ---------------------------------------------------------------------------
// Registry entry — lightweight index of all available fragments
// ---------------------------------------------------------------------------
export const RegistryEntrySchema = z.object({
  id: z.string(),
  tier: z.enum(["org", "department", "team", "project", "persona", "task"]),
  path: z.string(), // relative path from fragments root
  meta: FragmentMetaSchema,
  depends_on: z.array(z.string()).default([]),
});
export type RegistryEntry = z.infer<typeof RegistryEntrySchema>;

// ---------------------------------------------------------------------------
// Compile request
// ---------------------------------------------------------------------------
export const CompileRequestSchema = z.object({
  fragmentPaths: z
    .array(z.string())
    .min(1, "At least one fragment path is required"),
  tokenBudget: z.number().positive().default(8192),
  encoding: z
    .enum(["cl100k_base", "o200k_base"])
    .default("cl100k_base"),
});
export type CompileRequest = z.infer<typeof CompileRequestSchema>;


// ---------------------------------------------------------------------------
// Compilation manifest — lineage metadata kept separate from prompt text
// ---------------------------------------------------------------------------
export interface ConflictResolution {
  key: string;
  winner: string; // fragment id that won
  overrode: string[]; // fragment ids that were overridden
}

export interface ManifestFragment {
  id: string;
  tier: Tier;
  version: string;
  path: string;
}

export interface CompilationManifest {
  compiledAt: string;
  selectedFragments: ManifestFragment[];
  tokenCount: number;
  tokenBudget: number;
  exceedsBudget: boolean;
  conflictResolutions: ConflictResolution[];
  missingDependencies: Array<{ fragmentId: string; missingIds: string[] }>;
}

// ---------------------------------------------------------------------------
// Compile result
// ---------------------------------------------------------------------------
export interface CompileResult {
  markdown: string;
  openAIMessage: { role: "system"; content: string };
  manifest: CompilationManifest;
}
