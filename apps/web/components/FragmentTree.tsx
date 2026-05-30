"use client";

import { useState } from "react";
import type { RegistryEntry } from "@/lib/types";

// Mirrors TIER_ORDER in @prompt-primer/compiler/src/types.ts.
// Kept local because FragmentTree is a client component and the compiler
// package imports Node.js built-ins (fs, path) that cannot be bundled for
// the browser. Update both if the tier list ever changes.
const TIER_ORDER = ["org", "department", "team", "project", "persona", "task"] as const;
const TIER_LABELS: Record<string, string> = {
  org: "Organization",
  department: "Departments",
  team: "Teams",
  project: "Projects",
  persona: "Personas",
  task: "Tasks",
};

interface Props {
  fragments: RegistryEntry[];
  selected: Set<string>;
  onToggle: (fragmentId: string) => void;
}

export function FragmentTree({ fragments, selected, onToggle }: Props) {
  const [search, setSearch] = useState("");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({
    department: true,
    team: true,
    project: true,
    persona: true,
    task: true,
  });

  const filtered = search.trim()
    ? fragments.filter(
        (f) =>
          f.id.toLowerCase().includes(search.toLowerCase()) ||
          f.meta.description.toLowerCase().includes(search.toLowerCase()) ||
          f.meta.tags.some((t) => t.toLowerCase().includes(search.toLowerCase()))
      )
    : fragments;

  const byTier = TIER_ORDER.reduce<Record<string, RegistryEntry[]>>(
    (acc, tier) => {
      acc[tier] = filtered.filter((f) => f.tier === tier);
      return acc;
    },
    {}
  );

  const toggleTier = (tier: string) =>
    setCollapsed((prev) => ({ ...prev, [tier]: !prev[tier] }));

  return (
    <div className="flex flex-col gap-2 h-full">
      <input
        type="search"
        placeholder="Search fragments..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
      />

      <div className="flex-1 overflow-y-auto space-y-1">
        {TIER_ORDER.map((tier) => {
          const items = byTier[tier];
          if (items.length === 0) return null;
          const isCollapsed = collapsed[tier];
          const tierHasSelection = items.some((f) => selected.has(f.id));

          return (
            <div key={tier}>
              <button
                onClick={() => toggleTier(tier)}
                className={`flex w-full items-center justify-between rounded px-2 py-1.5 text-xs font-semibold uppercase tracking-wider transition-colors hover:text-zinc-200 ${
                  tierHasSelection
                    ? "bg-indigo-900/30 text-indigo-300"
                    : "text-zinc-400"
                }`}
              >
                <span>{TIER_LABELS[tier]}</span>
                <span className={tierHasSelection ? "text-indigo-500" : "text-zinc-600"}>
                  {isCollapsed ? "▶" : "▼"}
                </span>
              </button>

              {!isCollapsed && (
                <ul className="ml-2 space-y-0.5">
                  {items.map((fragment) => {
                    const isSelected = selected.has(fragment.id);
                    return (
                      <li key={fragment.id}>
                        <button
                          onClick={() => onToggle(fragment.id)}
                          className={`flex w-full items-start gap-2 rounded px-2 py-1.5 text-left text-sm transition-colors ${
                            isSelected
                              ? "bg-indigo-900/60 text-indigo-100"
                              : "text-zinc-300 hover:bg-zinc-700/60"
                          }`}
                          title={fragment.meta.description}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => onToggle(fragment.id)}
                            onClick={(e) => e.stopPropagation()}
                            className="mt-0.5 shrink-0 accent-indigo-500"
                          />
                          <span className="flex-1 min-w-0">
                            <span className="block font-mono text-xs truncate">
                              {fragment.id}
                            </span>
                            <span className="block text-xs text-zinc-500 truncate">
                              {fragment.meta.description}
                            </span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}

        {filtered.length === 0 && (
          <p className="px-2 py-4 text-center text-sm text-zinc-500">
            No fragments match your search.
          </p>
        )}
      </div>
    </div>
  );
}
