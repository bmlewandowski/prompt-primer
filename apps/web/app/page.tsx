"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FragmentTree } from "@/components/FragmentTree";
import { TokenBudget } from "@/components/TokenBudget";
import { PreviewPane } from "@/components/PreviewPane";
import { LibraryManager } from "@/components/LibraryManager";
import { PresetSelector } from "@/components/PresetSelector";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import type { RegistryEntry, CompileResult, TierConfig } from "@/lib/types";
import type { HealthIssue } from "@/app/api/fragments/health/route";

const DEFAULT_TOKEN_BUDGET = 8192;
const DEBOUNCE_MS = 400;
const STORAGE_KEY = "pp:session";

const FORMAT_OPTIONS: {
  value: "fabric" | "xml" | "prose" | "json" | "chatml";
  label: string;
  description: string;
  usedBy: string[];
}[] = [
  {
    value: "fabric",
    label: "Fabric",
    description: "Markdown H1 headers — # IDENTITY AND PURPOSE, # STEPS, # OUTPUT INSTRUCTIONS.",
    usedBy: ["Fabric CLI", "Most open-source workflows"],
  },
  {
    value: "xml",
    label: "XML",
    description: "Tagged XML sections — <identity_and_purpose>, <steps>… Preferred by Anthropic.",
    usedBy: ["Claude", "Amazon Bedrock", "Google Gemini"],
  },
  {
    value: "prose",
    label: "Prose",
    description: "Plain text with no structural markup. Maximum portability.",
    usedBy: ["ChatGPT", "Any model", "Chat interfaces"],
  },
  {
    value: "json",
    label: "JSON",
    description: "Raw structured JSON. For API integrations and programmatic pipelines.",
    usedBy: ["OpenAI API", "Azure OpenAI", "Custom integrations"],
  },
  {
    value: "chatml",
    label: "ChatML",
    description: "<|im_start|>system tokens — the training format for OpenAI and open models.",
    usedBy: ["GPT-4", "Mistral", "LLaMA variants", "Ollama"],
  },
];

export default function BuilderPage() {
  const [fragments, setFragments] = useState<RegistryEntry[]>([]);
  const [tiers, setTiers] = useState<TierConfig[]>([]);
  const [fragmentsError, setFragmentsError] = useState<string | null>(null);
  const [healthIssues, setHealthIssues] = useState<HealthIssue[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [result, setResult] = useState<CompileResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [tokenBudget, setTokenBudget] = useState(DEFAULT_TOKEN_BUDGET);
  const [outputFormat, setOutputFormat] = useState<"fabric" | "xml" | "prose" | "json" | "chatml">("fabric");
  const [showManager, setShowManager] = useState(false);
  const [showPresetSelector, setShowPresetSelector] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<{
    title: string;
    message: string;
    onConfirm: () => void;
  } | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Holds fragment IDs loaded from localStorage until fragments registry is available.
  const pendingIdsRef = useRef<string[] | null>(null);
  // Prevents the selection restoration from running more than once.
  const hasRestoredRef = useRef(false);
  // Prevents saving defaults to localStorage before prefs have been loaded.
  const isFirstSaveRef = useRef(true);

  // Load fragment registry and tier config on mount
  useEffect(() => {
    fetch("/api/fragments")
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to load fragments");
        setFragments(data);
        // Show preset selector if library is empty
        if (Array.isArray(data) && data.length === 0) {
          setShowPresetSelector(true);
        }
      })
      .catch((err) => setFragmentsError(String(err)));
    fetch("/api/tiers")
      .then(async (res) => {
        const data = await res.json();
        if (data?.tiers && Array.isArray(data.tiers)) setTiers(data.tiers);
      })
      .catch(() => {}); // non-fatal
    fetch("/api/fragments/health")
      .then(async (res) => {
        const data = await res.json();
        if (Array.isArray(data?.issues)) setHealthIssues(data.issues);
      })
      .catch(() => {}); // non-fatal
  }, []);

  const reloadFragments = useCallback(() => {
    setFragmentsError(null);
    fetch("/api/fragments")
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to load fragments");
        setFragments(data);
        // Clear selection since fragment IDs may have changed
        setSelected(new Set());
        setResult(null);
      })
      .catch((err) => setFragmentsError(String(err)));
    fetch("/api/tiers")
      .then(async (res) => {
        const data = await res.json();
        if (data?.tiers && Array.isArray(data.tiers)) setTiers(data.tiers);
      })
      .catch(() => {}); // non-fatal
    fetch("/api/fragments/health")
      .then(async (res) => {
        const data = await res.json();
        if (Array.isArray(data?.issues)) setHealthIssues(data.issues);
      })
      .catch(() => {}); // non-fatal
  }, []);

  // Debounced preview call whenever selection changes
  const triggerPreview = useCallback(
    (selectedIds: Set<string>) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);

      if (selectedIds.size === 0) {
        setResult(null);
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setPreviewError(null);
      debounceRef.current = setTimeout(async () => {
        const paths = [...selectedIds].map((id) => {
          const fragment = fragments.find((f) => f.id === id);
          return fragment?.path ?? id;
        });

        try {
          const res = await fetch("/api/preview", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ fragmentPaths: paths, tokenBudget, outputFormat }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error ?? "Compilation failed");
          setResult(data);
        } catch (err) {
          setResult(null);
          setPreviewError(err instanceof Error ? err.message : "Compilation failed");
        } finally {
          setIsLoading(false);
        }
      }, DEBOUNCE_MS);
    },
    [fragments, tokenBudget, outputFormat]
  );

  // Load saved preferences from localStorage on mount.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as Record<string, unknown>;
        if (typeof saved.tokenBudget === "number") setTokenBudget(saved.tokenBudget);
        const VALID_FORMATS = ["fabric", "xml", "prose", "json", "chatml"] as const;
        if (VALID_FORMATS.includes(saved.outputFormat as typeof VALID_FORMATS[number]))
          setOutputFormat(saved.outputFormat as typeof VALID_FORMATS[number]);
        if (Array.isArray(saved.selected)) pendingIdsRef.current = saved.selected as string[];
      }
    } catch {
      // Ignore malformed storage
    }
  }, []);

  // Once the fragment registry loads, restore the saved selection.
  useEffect(() => {
    if (hasRestoredRef.current || fragments.length === 0 || pendingIdsRef.current === null)
      return;
    hasRestoredRef.current = true;
    const validIds = new Set(fragments.map((f) => f.id));
    const restored = new Set(pendingIdsRef.current.filter((id) => validIds.has(id)));
    pendingIdsRef.current = null;
    if (restored.size > 0) {
      setSelected(restored);
      triggerPreview(restored);
    }
  }, [fragments, triggerPreview]);

  // Persist preferences to localStorage whenever they change (skip first render
  // to avoid overwriting stored data before the load effect has applied it).
  useEffect(() => {
    if (isFirstSaveRef.current) {
      isFirstSaveRef.current = false;
      return;
    }
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ selected: [...selected], tokenBudget, outputFormat })
      );
    } catch {
      // Ignore quota errors
    }
  }, [selected, tokenBudget, outputFormat]);

  // Re-compile when the token budget changes without requiring a fragment toggle.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (selected.size > 0) triggerPreview(selected); }, [tokenBudget]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (selected.size > 0) triggerPreview(selected); }, [outputFormat]);

  const handleToggle = useCallback(
    (fragmentId: string) => {
      setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(fragmentId)) {
          next.delete(fragmentId);
        } else {
          next.add(fragmentId);
        }
        triggerPreview(next);
        return next;
      });
    },
    [triggerPreview]
  );

  const handleResetDefaults = () => {
    setConfirmDialog({
      title: "Clear fragment library?",
      message:
        "This will delete all fragments and clear your library. Your saved selection and preferences will also be cleared. After reset, you can select a starter pack or build from scratch. This cannot be undone.",
      onConfirm: async () => {
        setConfirmDialog(null);
        setIsLoading(true);
        try {
          const res = await fetch("/api/fragments/reset", { method: "POST" });
          if (!res.ok) {
            const d = await res.json();
            throw new Error(d.error ?? "Reset failed");
          }
          try { localStorage.removeItem(STORAGE_KEY); } catch {}
          setSelected(new Set());
          setTokenBudget(DEFAULT_TOKEN_BUDGET);
          setOutputFormat("fabric");
          setResult(null);
          reloadFragments();
          // Show preset selector after reset
          setShowPresetSelector(true);
        } catch (err) {
          // Surface error in the preview area
          setPreviewError(err instanceof Error ? err.message : "Reset failed");
        } finally {
          setIsLoading(false);
        }
      },
    });
  };

  const tokenCount = result?.manifest.tokenCount ?? 0;

  return (
    <div className="flex h-screen flex-col bg-zinc-950 text-zinc-100">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-zinc-800 px-6 py-3">
        <div className="flex items-center gap-3">
          <span className="text-lg font-semibold tracking-tight text-white">
            Prompt Primer
          </span>
          <span className="rounded bg-indigo-900/60 px-2 py-0.5 text-xs text-indigo-300">
            Hierarchical Prompt Compiler
          </span>
        </div>

        {/* Token budget control */}
        <div className="flex items-center gap-3">
          <label className="text-xs text-zinc-500">Format</label>
          <div className="flex rounded border border-zinc-700 bg-zinc-800 overflow-visible">
            {FORMAT_OPTIONS.map((fmt) => (
              <div key={fmt.value} className="relative group">
                <button
                  onClick={() => setOutputFormat(fmt.value)}
                  className={`px-2.5 py-1 text-xs transition-colors ${
                    outputFormat === fmt.value
                      ? "bg-indigo-600 text-white"
                      : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  {fmt.label}
                </button>
                <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2.5 z-50 hidden group-hover:block pointer-events-none">
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 w-0 h-0 border-x-4 border-x-transparent border-b-4 border-b-zinc-700" />
                  <div className="bg-zinc-900 border border-zinc-700 rounded-md px-3 py-2 text-xs text-zinc-300 w-56 shadow-xl">
                    <div className="font-semibold text-white mb-1">{fmt.label}</div>
                    <div className="text-zinc-400 mb-2 leading-relaxed">{fmt.description}</div>
                    <div className="flex flex-wrap gap-1">
                      {fmt.usedBy.map((name) => (
                        <span key={name} className="bg-zinc-800 border border-zinc-700 rounded px-1.5 py-0.5 text-zinc-300 text-[10px]">{name}</span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <label className="text-xs text-zinc-500">Budget</label>
          <select
            value={tokenBudget}
            onChange={(e) => setTokenBudget(Number(e.target.value))}
            className="rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs text-zinc-300 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            <option value={4096}>4k tokens</option>
            <option value={8192}>8k tokens</option>
            <option value={16384}>16k tokens</option>
            <option value={32768}>32k tokens</option>
            <option value={128000}>128k tokens</option>
          </select>
          <span className="text-xs text-zinc-500">
            {selected.size} fragment{selected.size !== 1 ? "s" : ""} selected
          </span>
          <div className="w-px h-4 bg-zinc-700 mx-1" />
          <button
            onClick={handleResetDefaults}
            className="rounded border border-zinc-700 bg-zinc-800 px-3 py-1 text-xs text-zinc-500 hover:bg-orange-900/60 hover:border-orange-700 hover:text-orange-300 transition-colors"
            title="Clear all fragments from library"
          >
            Clear Library
          </button>
          <button
            onClick={() => setShowManager(true)}
            className="relative rounded border border-zinc-700 bg-zinc-800 px-3 py-1 text-xs text-zinc-300 hover:bg-indigo-600 hover:border-indigo-500 hover:text-white transition-colors"
          >
            Manage Library
            {healthIssues.length > 0 && (
              <span
                className="absolute -top-1.5 -right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-bold text-zinc-900"
                title={`${healthIssues.length} fragment${healthIssues.length !== 1 ? "s" : ""} with validation issues`}
              >
                {healthIssues.length}
              </span>
            )}
          </button>
        </div>
      </header>

      {/* Main layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left sidebar — Fragment Tree */}
        <aside className="flex w-72 shrink-0 flex-col border-r border-zinc-800 p-4 overflow-hidden">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">
            Fragment Library
          </h2>

          {fragmentsError ? (
            <div className="rounded-md border border-red-800 bg-red-900/20 p-3 text-xs text-red-300">
              {fragmentsError}
            </div>
          ) : fragments.length === 0 ? (
            <div className="flex flex-1 items-center justify-center text-xs text-zinc-600">
              Loading…
            </div>
          ) : (
            <FragmentTree
              fragments={fragments}
              selected={selected}
              onToggle={handleToggle}
              tiers={tiers}
            />
          )}
        </aside>

        {/* Right panel — Preview + Token Budget */}
        <main className="flex flex-1 flex-col gap-4 overflow-hidden p-4">
          <TokenBudget tokenCount={tokenCount} tokenBudget={tokenBudget} />
          <div className="flex-1 overflow-hidden">
            <PreviewPane result={result} isLoading={isLoading} previewError={previewError} />
          </div>
        </main>
      </div>

      {showManager && (
        <LibraryManager
          onClose={() => setShowManager(false)}
          onRegistryChanged={reloadFragments}
        />
      )}

      {showPresetSelector && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-2xl">
            <PresetSelector
              onSelect={async (presetId) => {
                try {
                  const res = await fetch("/api/presets/apply", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ presetId }),
                  });
                  if (!res.ok) throw new Error("Failed to apply preset");
                  const { preset } = await res.json();
                  const fragmentIds = preset.fragmentPaths.map((path: string) => {
                    const filename = path.split('/').pop() || '';
                    return filename.replace(/\.yaml$/, '');
                  });
                  setSelected(new Set(fragmentIds));
                  setShowPresetSelector(false);
                  reloadFragments();
                } catch (err) {
                  setPreviewError(err instanceof Error ? err.message : "Failed to apply preset");
                }
              }}
              onCancel={() => setShowPresetSelector(false)}
            />
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmDialog !== null}
        title={confirmDialog?.title ?? ""}
        message={confirmDialog?.message ?? ""}
        onConfirm={confirmDialog?.onConfirm ?? (() => {})}
        onCancel={() => setConfirmDialog(null)}
      />
    </div>
  );
}
