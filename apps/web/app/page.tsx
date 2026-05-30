"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FragmentTree } from "@/components/FragmentTree";
import { TokenBudget } from "@/components/TokenBudget";
import { PreviewPane } from "@/components/PreviewPane";
import type { RegistryEntry, CompileResult } from "@/lib/types";

const DEFAULT_TOKEN_BUDGET = 8192;
const DEBOUNCE_MS = 400;

export default function BuilderPage() {
  const [fragments, setFragments] = useState<RegistryEntry[]>([]);
  const [fragmentsError, setFragmentsError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [result, setResult] = useState<CompileResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [tokenBudget, setTokenBudget] = useState(DEFAULT_TOKEN_BUDGET);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load fragment registry on mount
  useEffect(() => {
    fetch("/api/fragments")
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to load fragments");
        setFragments(data);
      })
      .catch((err) => setFragmentsError(String(err)));
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
            body: JSON.stringify({ fragmentPaths: paths, tokenBudget }),
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
    [fragments, tokenBudget]
  );

  // Re-compile when the token budget changes without requiring a fragment toggle.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (selected.size > 0) triggerPreview(selected); }, [tokenBudget]);

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
    </div>
  );
}
