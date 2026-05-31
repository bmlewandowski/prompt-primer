// Client-safe type re-exports (no Node.js fs imports)
export type { RegistryEntry, CompileResult, CompilationManifest } from "@prompt-primer/compiler";

export interface TierConfig {
  id: string;
  label: string;
}
