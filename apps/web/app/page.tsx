"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FragmentTree } from "@/components/FragmentTree";
import { TokenBudget } from "@/components/TokenBudget";
import { PreviewPane } from "@/components/PreviewPane";
import { LibraryManager } from "@/components/LibraryManager";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import type { RegistryEntry, CompileResult, TierConfig } from "@/lib/types";

const DEFAULT_TOKEN_BUDGET = 8192;
const DEBOUNCE_MS = 400;
const STORAGE_KEY = "pp:session";

export default function BuilderPage() {
  const [fragments, setFragments] = useState<RegistryEntry[]>([]);
  const [tiers, setTiers] = useState<TierConfig[]>([]);
  const [fragmentsError, setFragmentsError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [result, setResult] = useState<CompileResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [tokenBudget, setTokenBudget] = useState(DEFAULT_TOKEN_BUDGET);
  const [outputFormat, setOutputFormat] = useState<"fabric" | "xml" | "prose" | "json" | "chatml">("fabric");
  const [showManager, setShowManager] = useState(false);
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
      })
      .catch((err) => setFragmentsError(String(err)));
    fetch("/api/tiers")
      .then(async (res) => {
        const data = await res.json();
        if (data?.tiers && Array.isArray(data.tiers)) setTiers(data.tiers);
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
        if (typeof saved.outputFormat === "string")
          setOutputFormat(saved.outputFormat as "fabric" | "xml" | "prose" | "json" | "chatml");
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
      title: "Reset to factory defaults?",
      message:
        "This will delete all user-created fragments and tiers, and restore the original library. Your saved selection and preferences will also be cleared. This cannot be undone.",
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
          <button
            onClick={() => setShowManager(true)}
            className="rounded border border-zinc-700 bg-zinc-800 px-3 py-1 text-xs text-zinc-300 hover:bg-zinc-700 hover:text-white transition-colors"
          >
            Manage Library
          </button>
          <button
            onClick={handleResetDefaults}
            className="rounded border border-zinc-700 bg-zinc-800 px-3 py-1 text-xs text-zinc-500 hover:bg-zinc-700 hover:text-zinc-300 transition-colors"
            title="Reset selection and preferences to defaults"
          >
            Reset
          </button>
          <label className="text-xs text-zinc-500">Format</label>
          <select
            value={outputFormat}
            onChange={(e) => setOutputFormat(e.target.value as "fabric" | "xml" | "prose" | "json" | "chatml")}
            className="rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs text-zinc-300 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            <option value="fabric">Fabric</option>
            <option value="xml">XML</option>
            <option value="prose">Prose</option>
            <option value="json">JSON</option>
            <option value="chatml">ChatML</option>
          </select>
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
