"use client";

import { useState } from "react";
import type { RegistryEntry, TierConfig } from "@/lib/types";

interface Props {
  fragments: RegistryEntry[];
  selected: Set<string>;
  onToggle: (fragmentId: string) => void;
  tiers: TierConfig[];
}

export function FragmentTree({ fragments, selected, onToggle, tiers }: Props) {
  const [search, setSearch] = useState("");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  // Build ordered tier list: known tiers first (in config order), then any
  // unknown tiers found in fragments (alphabetically at the end).
  const knownTierIds = tiers.map((t) => t.id);
  const tierLabels: Record<string, string> = Object.fromEntries(
    tiers.map((t) => [t.id, t.label])
  );

  const filtered = search.trim()
    ? fragments.filter(
        (f) =>
          f.id.toLowerCase().includes(search.toLowerCase()) ||
          f.meta.description.toLowerCase().includes(search.toLowerCase()) ||
          f.meta.tags.some((t) => t.toLowerCase().includes(search.toLowerCase()))
      )
    : fragments;

  // All tiers that actually have matching fragments
  const tiersWithFragments = new Set(filtered.map((f) => f.tier));
  const unknownTierIds = [...tiersWithFragments]
    .filter((t) => !knownTierIds.includes(t))
    .sort();
  const orderedTiers = [
    ...knownTierIds.filter((id) => tiersWithFragments.has(id)),
    ...unknownTierIds,
  ];

  const byTier = orderedTiers.reduce<Record<string, RegistryEntry[]>>(
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
        {orderedTiers.map((tier, tierIndex) => {
          const items = byTier[tier];
          if (!items || items.length === 0) return null;
          // Default: first tier expanded, rest collapsed (unless user has toggled)
          const isCollapsed = tier in collapsed ? collapsed[tier] : tierIndex > 0;
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
                <span>{tierLabels[tier] ?? tier}</span>
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
