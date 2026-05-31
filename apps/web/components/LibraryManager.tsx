"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { RegistryEntry } from "@/lib/types";
import { FragmentEditor } from "./FragmentEditor";

interface TierConfig {
  id: string;
  label: string;
}

interface Props {
  onClose: () => void;
  onRegistryChanged: () => void;
}

export function LibraryManager({ onClose, onRegistryChanged }: Props) {
  const [tiers, setTiers] = useState<TierConfig[]>([]);
  const [fragments, setFragments] = useState<RegistryEntry[]>([]);
  const [selectedTierId, setSelectedTierId] = useState<string | null>(null);
  const [editingFragment, setEditingFragment] = useState<{
    id: string | null;
    tier: string;
  } | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Import / export state
  const importInputRef = useRef<HTMLInputElement>(null);
  const [importLoading, setImportLoading] = useState(false);
  type ImportResult = { imported: number; skipped: number; errors?: Array<{ index: number; id?: string; error: string }> };
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [draggingTierIdx, setDraggingTierIdx] = useState<number | null>(null);
  const [dropTierIdx, setDropTierIdx] = useState<number | null>(null);

  // Fragment drag state (for moving to a different tier)
  const [draggingFragId, setDraggingFragId] = useState<string | null>(null);
  const [dropOnTierId, setDropOnTierId] = useState<string | null>(null);

  // Inline tier rename
  const [renamingTierId, setRenamingTierId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  // Add tier form
  const [addingTier, setAddingTier] = useState(false);
  const [newTierId, setNewTierId] = useState("");
  const [newTierLabel, setNewTierLabel] = useState("");

  const loadData = useCallback(async (keepSelected?: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const [tiersRes, fragsRes] = await Promise.all([
        fetch("/api/tiers"),
        fetch("/api/fragments"),
      ]);
      const tiersData = await tiersRes.json();
      const fragsData = await fragsRes.json();
      if (!tiersRes.ok) throw new Error(tiersData.error ?? "Failed to load tiers");
      if (!fragsRes.ok) throw new Error(fragsData.error ?? "Failed to load fragments");

      setTiers(tiersData.tiers);
      setFragments(Array.isArray(fragsData) ? fragsData : []);
      setSelectedTierId((prev) => {
        const target = keepSelected ?? prev ?? tiersData.tiers[0]?.id ?? null;
        return tiersData.tiers.some((t: TierConfig) => t.id === target)
          ? target
          : tiersData.tiers[0]?.id ?? null;
      });
    } catch (e) {
      setError(String(e));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // -------------------------------------------------------------------------
  // Tier save helper
  // -------------------------------------------------------------------------
  const saveTiers = useCallback(
    async (newTiers: TierConfig[]) => {
      setSaving(true);
      try {
        const res = await fetch("/api/tiers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tiers: newTiers }),
        });
        if (!res.ok) {
          const d = await res.json();
          throw new Error(d.error ?? "Failed to save tiers");
        }
        setTiers(newTiers);
        onRegistryChanged();
      } catch (e) {
        setError(String(e));
      } finally {
        setSaving(false);
      }
    },
    [onRegistryChanged]
  );

  // -------------------------------------------------------------------------
  // Tier drag-and-drop (reorder)
  // -------------------------------------------------------------------------
  const handleTierDragStart = (e: React.DragEvent, idx: number) => {
    setDraggingTierIdx(idx);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/x-tier-index", String(idx));
  };

  const handleTierDragOver = (e: React.DragEvent, idx: number) => {
    if (!e.dataTransfer.types.includes("text/x-tier-index")) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDropTierIdx(idx);
  };

  const handleTierDrop = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    const from = Number(e.dataTransfer.getData("text/x-tier-index"));
    setDraggingTierIdx(null);
    setDropTierIdx(null);
    if (isNaN(from) || from === idx) return;
    const reordered = [...tiers];
    const [moved] = reordered.splice(from, 1);
    reordered.splice(idx, 0, moved);
    saveTiers(reordered);
  };

  // -------------------------------------------------------------------------
  // Fragment drag-and-drop (move between tiers)
  // -------------------------------------------------------------------------
  const handleFragDragStart = (e: React.DragEvent, fragId: string) => {
    setDraggingFragId(fragId);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/x-fragment-id", fragId);
  };

  const handleTierDropFrag = useCallback(
    async (e: React.DragEvent, tierId: string) => {
      e.preventDefault();
      const fragId = e.dataTransfer.getData("text/x-fragment-id");
      setDropOnTierId(null);
      setDraggingFragId(null);
      if (!fragId) return;

      const frag = fragments.find((f) => f.id === fragId);
      if (!frag || frag.tier === tierId) return;

      setSaving(true);
      try {
        const getRes = await fetch(`/api/fragments/${fragId}`);
        if (!getRes.ok) throw new Error("Could not load fragment");
        const fullFrag = await getRes.json();

        const putRes = await fetch(`/api/fragments/${fragId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...fullFrag, tier: tierId }),
        });
        if (!putRes.ok) {
          const d = await putRes.json();
          throw new Error(d.error ?? "Failed to move fragment");
        }
        onRegistryChanged();
        await loadData(tierId);
      } catch (e) {
        setError(String(e));
      } finally {
        setSaving(false);
      }
    },
    [fragments, loadData, onRegistryChanged]
  );

  // -------------------------------------------------------------------------
  // Tier CRUD
  // -------------------------------------------------------------------------
  const handleAddTier = async () => {
    const id = newTierId.trim().toLowerCase().replace(/\s+/g, "_");
    const label = newTierLabel.trim() || id;
    if (!id || !/^[a-z0-9_-]+$/.test(id)) {
      setError("Tier ID must be lowercase letters, numbers, underscores, or hyphens");
      return;
    }
    if (tiers.some((t) => t.id === id)) {
      setError(`Tier "${id}" already exists`);
      return;
    }
    const newTiers = [...tiers, { id, label }];
    await saveTiers(newTiers);
    setSelectedTierId(id);
    setNewTierId("");
    setNewTierLabel("");
    setAddingTier(false);
  };

  const handleRenameTier = async (tierId: string) => {
    const label = renameValue.trim();
    if (!label) {
      setRenamingTierId(null);
      setRenameValue("");
      return;
    }
    const newTiers = tiers.map((t) =>
      t.id === tierId ? { ...t, label } : t
    );
    await saveTiers(newTiers);
    setRenamingTierId(null);
    setRenameValue("");
  };

  const handleDeleteTier = async (tierId: string) => {
    const tierFrags = fragments.filter((f) => f.tier === tierId);
    if (tierFrags.length > 0) {
      setError(
        `Cannot delete "${tierId}" — it has ${tierFrags.length} fragment(s). Delete or move them first.`
      );
      return;
    }
    const newTiers = tiers.filter((t) => t.id !== tierId);
    await saveTiers(newTiers);
    if (selectedTierId === tierId) {
      setSelectedTierId(newTiers[0]?.id ?? null);
    }
  };

  // -------------------------------------------------------------------------
  // Fragment CRUD
  // -------------------------------------------------------------------------
  const handleDeleteFragment = async (fragId: string) => {
    if (!confirm(`Delete fragment "${fragId}"? This cannot be undone.`)) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/fragments/${fragId}`, { method: "DELETE" });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error ?? "Failed to delete fragment");
      }
      onRegistryChanged();
      await loadData(selectedTierId ?? undefined);
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  const handleEditorSave = async () => {
    onRegistryChanged();
    setEditingFragment(null);
    await loadData(selectedTierId ?? undefined);
  };

  // -------------------------------------------------------------------------
  // Import / export
  // -------------------------------------------------------------------------
  const handleExport = async () => {
    try {
      const res = await fetch("/api/fragments/export");
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error ?? "Export failed");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const date = new Date().toISOString().split("T")[0];
      a.download = `prompt-primer-export-${date}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(String(e));
    }
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Reset so re-selecting the same file fires onChange again
    e.target.value = "";
    setImportResult(null);
    setError(null);
    setImportLoading(true);
    try {
      const text = await file.text();
      let bundle: unknown;
      try {
        bundle = JSON.parse(text);
      } catch {
        throw new Error("File is not valid JSON");
      }
      // Support both raw array and bundle objects
      const fragments =
        Array.isArray(bundle)
          ? bundle
          : Array.isArray((bundle as Record<string, unknown>)?.fragments)
            ? (bundle as { fragments: unknown[] }).fragments
            : null;
      if (!fragments) throw new Error("No 'fragments' array found in the file");

      const res = await fetch("/api/fragments/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fragments, mode: "skip" }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error ?? "Import failed");
      setImportResult(result as ImportResult);
      onRegistryChanged();
      await loadData(selectedTierId ?? undefined);
    } catch (e) {
      setError(String(e));
    } finally {
      setImportLoading(false);
    }
  };
  // -------------------------------------------------------------------------
  const selectedTierFragments = fragments.filter(
    (f) => f.tier === selectedTierId
  );
  const selectedTier = tiers.find((t) => t.id === selectedTierId);

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/90 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex flex-col bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl w-full max-w-5xl h-[85vh] overflow-hidden">
        {/* Dialog header */}
        <div className="flex items-center justify-between border-b border-zinc-800 px-6 py-4 shrink-0">
          <div>
            <h2 className="text-base font-semibold text-white">
              Fragment Library Manager
            </h2>
            <p className="text-xs text-zinc-500 mt-0.5">
              Drag tiers to set priority order · Drag fragments onto a tier to move them
            </p>
          </div>
          <div className="flex items-center gap-3">
            {(saving || importLoading) && (
              <span className="text-xs text-zinc-500 animate-pulse">
                {importLoading ? "Importing…" : "Saving…"}
              </span>
            )}
            <button
              onClick={handleExport}
              className="rounded border border-zinc-700 bg-zinc-800 px-3 py-1 text-xs text-zinc-300 hover:bg-zinc-700 hover:text-white transition-colors"
              title="Export all fragments as JSON"
            >
              Export
            </button>
            <button
              onClick={() => importInputRef.current?.click()}
              disabled={importLoading}
              className="rounded border border-zinc-700 bg-zinc-800 px-3 py-1 text-xs text-zinc-300 hover:bg-zinc-700 hover:text-white transition-colors disabled:opacity-50"
              title="Import fragments from a JSON bundle"
            >
              Import
            </button>
            <input
              ref={importInputRef}
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={handleImportFile}
            />
            <button
              onClick={onClose}
              className="rounded-md p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-white transition-colors"
              title="Close"
            >
              <svg
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        </div>

        {/* Error banner */}
        {error && (
          <div className="mx-6 mt-3 rounded-md border border-red-700/50 bg-red-900/20 px-3 py-2 text-xs text-red-300 flex items-center justify-between shrink-0">
            <span>{error}</span>
            <button
              onClick={() => setError(null)}
              className="ml-3 text-red-400 hover:text-red-200"
            >
              ✕
            </button>
          </div>
        )}
        {/* Import result banner */}
        {importResult && (
          <div className="mx-6 mt-3 rounded-md border border-emerald-700/50 bg-emerald-900/20 px-3 py-2 text-xs text-emerald-300 flex items-center justify-between shrink-0">
            <span>
              Import complete: <strong>{importResult.imported}</strong> added
              {importResult.skipped > 0 && (
                <>, <strong>{importResult.skipped}</strong> skipped (already exist)</>
              )}
              {importResult.errors && importResult.errors.length > 0 && (
                <>, <strong>{importResult.errors.length}</strong> invalid</>
              )}
            </span>
            <button
              onClick={() => setImportResult(null)}
              className="ml-3 text-emerald-400 hover:text-emerald-200"
            >
              ✕
            </button>
          </div>
        )}

        {isLoading ? (
          <div className="flex flex-1 items-center justify-center text-zinc-500 text-sm">
            Loading…
          </div>
        ) : editingFragment ? (
          <FragmentEditor
            fragmentId={editingFragment.id}
            initialTier={editingFragment.tier}
            tiers={tiers}
            allFragments={fragments}
            onSave={handleEditorSave}
            onCancel={() => setEditingFragment(null)}
          />
        ) : (
          <div className="flex flex-1 overflow-hidden">
            {/* ── Tier sidebar ── */}
            <div className="flex w-56 shrink-0 flex-col border-r border-zinc-800 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 shrink-0">
                <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                  Tiers
                </span>
                <button
                  onClick={() => setAddingTier(true)}
                  className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
                >
                  + Add
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
                {tiers.map((tier, idx) => (
                  <div
                    key={tier.id}
                    draggable
                    onDragStart={(e) => handleTierDragStart(e, idx)}
                    onDragOver={(e) => {
                      if (e.dataTransfer.types.includes("text/x-tier-index")) {
                        handleTierDragOver(e, idx);
                      } else if (
                        e.dataTransfer.types.includes("text/x-fragment-id")
                      ) {
                        e.preventDefault();
                        setDropOnTierId(tier.id);
                      }
                    }}
                    onDrop={(e) => {
                      if (e.dataTransfer.types.includes("text/x-fragment-id")) {
                        handleTierDropFrag(e, tier.id);
                      } else {
                        handleTierDrop(e, idx);
                      }
                    }}
                    onDragEnd={() => {
                      setDraggingTierIdx(null);
                      setDropTierIdx(null);
                      setDropOnTierId(null);
                      setDraggingFragId(null);
                    }}
                    onDragLeave={() => {
                      setDropTierIdx(null);
                      setDropOnTierId(null);
                    }}
                    onClick={() => setSelectedTierId(tier.id)}
                    className={[
                      "group flex items-center gap-2 rounded-md px-2 py-2 cursor-pointer transition-all select-none",
                      selectedTierId === tier.id
                        ? "bg-indigo-900/50 text-indigo-200"
                        : "text-zinc-300 hover:bg-zinc-800",
                      dropTierIdx === idx
                        ? "border-t-2 border-indigo-500"
                        : "",
                      dropOnTierId === tier.id
                        ? "ring-1 ring-indigo-500 bg-indigo-900/30"
                        : "",
                      draggingTierIdx === idx ? "opacity-40" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    <span className="text-zinc-600 cursor-grab shrink-0 text-xs">
                      ⋮⋮
                    </span>

                    {renamingTierId === tier.id ? (
                      <input
                        autoFocus
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleRenameTier(tier.id);
                          if (e.key === "Escape") {
                            setRenamingTierId(null);
                            setRenameValue("");
                          }
                        }}
                        onBlur={() => handleRenameTier(tier.id)}
                        onClick={(e) => e.stopPropagation()}
                        className="flex-1 min-w-0 bg-zinc-700 text-white text-xs rounded px-1 py-0.5 outline-none focus:ring-1 focus:ring-indigo-400"
                      />
                    ) : (
                      <span className="flex-1 min-w-0 text-sm truncate">
                        {tier.label}
                      </span>
                    )}

                    <span className="text-[10px] text-zinc-600 shrink-0 tabular-nums">
                      {fragments.filter((f) => f.tier === tier.id).length}
                    </span>

                    <div className="hidden group-hover:flex items-center gap-0.5 shrink-0">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setRenamingTierId(tier.id);
                          setRenameValue(tier.label);
                        }}
                        className="p-0.5 text-zinc-500 hover:text-zinc-200 transition-colors"
                        title="Rename tier"
                      >
                        ✏
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteTier(tier.id);
                        }}
                        className="p-0.5 text-zinc-500 hover:text-red-400 transition-colors"
                        title="Delete tier"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))}

                {addingTier && (
                  <div className="rounded-md border border-zinc-700 bg-zinc-800/60 p-2 mt-2 space-y-1.5">
                    <input
                      autoFocus
                      placeholder="id (e.g. workflow)"
                      value={newTierId}
                      onChange={(e) => setNewTierId(e.target.value)}
                      className="w-full bg-zinc-700 text-white text-xs rounded px-2 py-1 outline-none focus:ring-1 focus:ring-indigo-400 placeholder-zinc-500"
                    />
                    <input
                      placeholder="Label (e.g. Workflows)"
                      value={newTierLabel}
                      onChange={(e) => setNewTierLabel(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleAddTier();
                        if (e.key === "Escape") {
                          setAddingTier(false);
                          setNewTierId("");
                          setNewTierLabel("");
                        }
                      }}
                      className="w-full bg-zinc-700 text-white text-xs rounded px-2 py-1 outline-none focus:ring-1 focus:ring-indigo-400 placeholder-zinc-500"
                    />
                    <div className="flex gap-1">
                      <button
                        onClick={handleAddTier}
                        className="flex-1 py-1 text-xs rounded bg-indigo-600 text-white hover:bg-indigo-500 transition-colors"
                      >
                        Add
                      </button>
                      <button
                        onClick={() => {
                          setAddingTier(false);
                          setNewTierId("");
                          setNewTierLabel("");
                        }}
                        className="flex-1 py-1 text-xs rounded bg-zinc-700 text-zinc-300 hover:bg-zinc-600 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div className="px-4 py-2 border-t border-zinc-800 shrink-0">
                <p className="text-[10px] text-zinc-600 leading-tight">
                  Top tier = highest authority
                  <br />
                  Drag to change priority order
                </p>
              </div>
            </div>

            {/* ── Fragment panel ── */}
            <div className="flex flex-1 flex-col overflow-hidden">
              {selectedTier ? (
                <>
                  <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-3 shrink-0">
                    <div>
                      <h3 className="text-sm font-semibold text-white">
                        {selectedTier.label}
                      </h3>
                      <p className="text-xs text-zinc-500">
                        {selectedTierFragments.length} fragment
                        {selectedTierFragments.length !== 1 ? "s" : ""}
                      </p>
                    </div>
                    <button
                      onClick={() =>
                        setEditingFragment({
                          id: null,
                          tier: selectedTierId!,
                        })
                      }
                      className="flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 transition-colors"
                    >
                      + New Fragment
                    </button>
                  </div>

                  <div
                    className="flex-1 overflow-y-auto p-4 space-y-2"
                    onDragOver={(e) => {
                      if (
                        e.dataTransfer.types.includes("text/x-fragment-id")
                      ) {
                        e.preventDefault();
                        setDropOnTierId(selectedTierId);
                      }
                    }}
                    onDrop={(e) =>
                      handleTierDropFrag(e, selectedTierId!)
                    }
                    onDragLeave={() => setDropOnTierId(null)}
                  >
                    {selectedTierFragments.length === 0 ? (
                      <div
                        className={`flex h-32 items-center justify-center rounded-lg border-2 border-dashed text-sm transition-colors ${
                          dropOnTierId === selectedTierId
                            ? "border-indigo-500 bg-indigo-900/20 text-indigo-300"
                            : "border-zinc-700 text-zinc-600"
                        }`}
                      >
                        {dropOnTierId === selectedTierId
                          ? "Drop to move here"
                          : "No fragments · drag one here or click + New Fragment"}
                      </div>
                    ) : (
                      selectedTierFragments.map((frag) => (
                        <div
                          key={frag.id}
                          draggable
                          onDragStart={(e) =>
                            handleFragDragStart(e, frag.id)
                          }
                          onDragEnd={() => {
                            setDraggingFragId(null);
                            setDropOnTierId(null);
                          }}
                          className={`group flex items-start gap-3 rounded-lg border border-zinc-700/60 bg-zinc-800/40 px-4 py-3 transition-colors hover:border-zinc-600 ${
                            draggingFragId === frag.id ? "opacity-40" : ""
                          }`}
                        >
                          <span className="text-zinc-600 cursor-grab select-none mt-0.5 shrink-0 text-xs">
                            ⋮⋮
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="font-mono text-sm text-zinc-100">
                              {frag.id}
                            </p>
                            <p className="text-xs text-zinc-500 mt-0.5 truncate">
                              {frag.meta.description}
                            </p>
                            {frag.meta.tags.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1.5">
                                {frag.meta.tags.map((tag) => (
                                  <span
                                    key={tag}
                                    className="rounded px-1.5 py-0.5 text-[10px] bg-zinc-700 text-zinc-400"
                                  >
                                    {tag}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                            <button
                              onClick={() =>
                                setEditingFragment({
                                  id: frag.id,
                                  tier: frag.tier,
                                })
                              }
                              className="rounded px-2 py-1 text-xs bg-zinc-700 text-zinc-300 hover:bg-zinc-600 transition-colors"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => handleDeleteFragment(frag.id)}
                              className="rounded px-2 py-1 text-xs bg-red-900/30 text-red-400 hover:bg-red-900/60 transition-colors"
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </>
              ) : (
                <div className="flex flex-1 items-center justify-center text-zinc-600 text-sm">
                  Select a tier to view its fragments
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
