"use client";

import { useState, useEffect } from "react";
import type { Preset } from "@/app/api/presets/route";

interface Props {
  onSelect: (presetId: string) => void;
  onCancel?: () => void;
  showCancel?: boolean;
}

export function PresetSelector({ onSelect, onCancel, showCancel = false }: Props) {
  const [presets, setPresets] = useState<Preset[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/presets")
      .then((res) => res.json())
      .then((data) => {
        setPresets(data.presets || []);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to load presets:", err);
        setLoading(false);
      });
  }, []);

  const handleApply = () => {
    if (selected) {
      onSelect(selected);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-zinc-100 mb-2">
          Choose a Starter Pack
        </h2>
        <p className="text-sm text-zinc-400">
          Select a preset that matches your team or use case. You can customize
          fragments later through the Library Manager.
        </p>
      </div>

      <div className="grid gap-3">
        {presets.map((preset) => {
          const isSelected = selected === preset.id;
          return (
            <button
              key={preset.id}
              onClick={() => setSelected(preset.id)}
              className={`relative text-left p-4 rounded-lg border-2 transition-all ${
                isSelected
                  ? "border-indigo-500 bg-indigo-900/20"
                  : "border-zinc-700 bg-zinc-800/50 hover:border-zinc-600"
              }`}
            >
              <div className="flex items-start gap-3">
                <input
                  type="radio"
                  checked={isSelected}
                  onChange={() => setSelected(preset.id)}
                  className="mt-1 shrink-0 accent-indigo-500"
                />
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-zinc-100 mb-1">
                    {preset.name}
                  </h3>
                  <p className="text-sm text-zinc-400 mb-2">
                    {preset.description}
                  </p>
                  <p className="text-xs text-zinc-500">
                    {preset.fragments.length} fragment{preset.fragments.length !== 1 ? "s" : ""}
                  </p>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {presets.length === 0 && (
        <p className="text-center text-sm text-zinc-500 py-8">
          No presets available. Using default fragment library.
        </p>
      )}

      <div className="flex gap-3 justify-end">
        {showCancel && onCancel && (
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm rounded-md bg-zinc-700 text-zinc-300 hover:bg-zinc-600 transition-colors"
          >
            Cancel
          </button>
        )}
        <button
          onClick={handleApply}
          disabled={!selected}
          className="px-4 py-2 text-sm rounded-md bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          Apply Starter Pack
        </button>
      </div>
    </div>
  );
}
