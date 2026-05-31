"use client";

import { useState, useEffect } from "react";
import type { RegistryEntry } from "@/lib/types";
import { FragmentHistoryViewer } from "./FragmentHistoryViewer";

interface TierConfig {
  id: string;
  label: string;
}

interface RuleField {
  key: string;
  content: string;
}

interface FragmentFormData {
  id: string;
  tier: string;
  version: string;
  description: string;
  tags: string;
  author: string;
  fabric_source: string;
  depends_on: string[];
  replace_blocks: Array<"identity" | "context" | "steps">;
  identity: string;
  context: string;
  steps: string;
  rules: RuleField[];
}

const EMPTY_FORM = (tier: string): FragmentFormData => ({
  id: "",
  tier,
  version: "1.0.0",
  description: "",
  tags: "",
  author: "",
  fabric_source: "",
  depends_on: [],
  replace_blocks: [],
  identity: "",
  context: "",
  steps: "",
  rules: [],
});

const INPUT =
  "w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500";

const TEXTAREA =
  "w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-y font-mono";

interface Props {
  fragmentId: string | null;
  initialTier: string;
  tiers: TierConfig[];
  allFragments: RegistryEntry[];
  onSave: () => void;
  onCancel: () => void;
}

export function FragmentEditor({
  fragmentId,
  initialTier,
  tiers,
  allFragments,
  onSave,
  onCancel,
}: Props) {
  const [form, setForm] = useState<FragmentFormData>(EMPTY_FORM(initialTier));
  const [isLoading, setIsLoading] = useState(!!fragmentId);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    if (!fragmentId) {
      setForm(EMPTY_FORM(initialTier));
      return;
    }
    setIsLoading(true);
    fetch(`/api/fragments/${fragmentId}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to load fragment");
        setForm({
          id: data.id ?? "",
          tier: data.tier ?? initialTier,
          version: data.meta?.version ?? "1.0.0",
          description: data.meta?.description ?? "",
          tags: (data.meta?.tags ?? []).join(", "),
          author: data.meta?.author ?? "",
          fabric_source: data.meta?.fabric_source ?? "",
          depends_on: data.depends_on ?? [],
          replace_blocks: data.replace_blocks ?? [],
          identity: data.blocks?.identity ?? "",
          context: data.blocks?.context ?? "",
          steps: data.blocks?.steps ?? "",
          rules: (data.blocks?.rules ?? []).map(
            (r: { key?: string; content: string }) => ({
              key: r.key ?? "",
              content: r.content ?? "",
            })
          ),
        });
      })
      .catch((e) => setError(String(e)))
      .finally(() => setIsLoading(false));
  }, [fragmentId, initialTier]);

  const set = <K extends keyof FragmentFormData>(
    field: K,
    value: FragmentFormData[K]
  ) => setForm((prev) => ({ ...prev, [field]: value }));

  const addRule = () =>
    set("rules", [...form.rules, { key: "", content: "" }]);

  const updateRule = (idx: number, field: "key" | "content", value: string) =>
    set(
      "rules",
      form.rules.map((r, i) => (i === idx ? { ...r, [field]: value } : r))
    );

  const removeRule = (idx: number) =>
    set(
      "rules",
      form.rules.filter((_, i) => i !== idx)
    );

  const toggleDep = (id: string) =>
    set(
      "depends_on",
      form.depends_on.includes(id)
        ? form.depends_on.filter((d) => d !== id)
        : [...form.depends_on, id]
    );

  const handleRestoreFromHistory = (fragment: any) => {
    // Update form with restored fragment data
    setForm({
      id: fragment.id ?? "",
      tier: fragment.tier ?? initialTier,
      version: fragment.meta?.version ?? "1.0.0",
      description: fragment.meta?.description ?? "",
      tags: (fragment.meta?.tags ?? []).join(", "),
      author: fragment.meta?.author ?? "",
      fabric_source: fragment.meta?.fabric_source ?? "",
      depends_on: fragment.depends_on ?? [],
      replace_blocks: fragment.replace_blocks ?? [],
      identity: fragment.blocks?.identity ?? "",
      context: fragment.blocks?.context ?? "",
      steps: fragment.blocks?.steps ?? "",
      rules: (fragment.blocks?.rules ?? []).map(
        (r: { key?: string; content: string }) => ({
          key: r.key ?? "",
          content: r.content ?? "",
        })
      ),
    });
    setShowHistory(false);
  };

  const handleSave = async () => {
    setError(null);
    if (!form.id.trim()) {
      setError("ID is required");
      return;
    }
    if (!/^[a-z0-9_-]+$/.test(form.id)) {
      setError("ID must be lowercase letters, numbers, underscores, or hyphens");
      return;
    }
    if (!form.tier) {
      setError("Tier is required");
      return;
    }
    if (!form.description.trim()) {
      setError("Description is required");
      return;
    }

    const fragment = {
      id: form.id.trim(),
      tier: form.tier,
      meta: {
        version: form.version.trim() || "1.0.0",
        description: form.description.trim(),
        tags: form.tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
        author: form.author.trim() || "unknown",
        updated: new Date().toISOString().split("T")[0],
        fabric_source: form.fabric_source.trim() || null,
      },
      depends_on: form.depends_on,
      replace_blocks: form.replace_blocks,
      blocks: {
        identity: form.identity.trim() || null,
        context: form.context.trim() || null,
        steps: form.steps.trim() || null,
        rules: form.rules
          .filter((r) => r.content.trim())
          .map((r) => ({
            ...(r.key.trim() ? { key: r.key.trim() } : {}),
            content: r.content.trim(),
          })),
      },
    };

    setIsSaving(true);
    try {
      const url = fragmentId
        ? `/api/fragments/${fragmentId}`
        : "/api/fragments";
      const method = fragmentId ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fragment),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save fragment");
      onSave();
    } catch (e) {
      setError(String(e));
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center text-zinc-500 text-sm">
        Loading…
      </div>
    );
  }

  const otherFragments = allFragments.filter((f) => f.id !== fragmentId);

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-3 shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={onCancel}
            className="text-zinc-400 hover:text-zinc-200 text-sm transition-colors"
          >
            ← Back
          </button>
          <span className="text-zinc-700">|</span>
          <h3 className="text-sm font-medium text-white">
            {fragmentId ? `Editing: ${fragmentId}` : "New Fragment"}
          </h3>
          {fragmentId && (
            <>
              <span className="text-zinc-700">|</span>
              <button
                onClick={() => setShowHistory(true)}
                className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors flex items-center gap-1"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                View History
              </button>
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onCancel}
            className="rounded-md px-3 py-1.5 text-xs border border-zinc-700 text-zinc-300 hover:bg-zinc-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="rounded-md px-4 py-1.5 text-xs bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-50 transition-colors font-medium"
          >
            {isSaving ? "Saving…" : "Save Fragment"}
          </button>
        </div>
      </div>

      {error && (
        <div className="mx-5 mt-3 rounded-md border border-red-700/50 bg-red-900/20 px-3 py-2 text-xs text-red-300 flex items-center justify-between shrink-0">
          <span>{error}</span>
          <button
            onClick={() => setError(null)}
            className="ml-2 text-red-400 hover:text-red-200"
          >
            ✕
          </button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-5 space-y-6">
        {/* Core identity */}
        <div className="grid grid-cols-2 gap-4">
          <Field label="Fragment ID" required>
            <input
              value={form.id}
              onChange={(e) => set("id", e.target.value.toLowerCase().replace(/\s+/g, "_"))}
              disabled={!!fragmentId}
              placeholder="e.g. my_fragment"
              className={INPUT + (fragmentId ? " opacity-50 cursor-not-allowed" : "")}
            />
          </Field>
          <Field label="Tier" required>
            <select
              value={form.tier}
              onChange={(e) => set("tier", e.target.value)}
              className={INPUT}
            >
              {tiers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Description" required className="col-span-2">
            <input
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              placeholder="Brief description of this fragment"
              className={INPUT}
            />
          </Field>
          <Field label="Tags">
            <input
              value={form.tags}
              onChange={(e) => set("tags", e.target.value)}
              placeholder="comma, separated, tags"
              className={INPUT}
            />
          </Field>
          <Field label="Author">
            <input
              value={form.author}
              onChange={(e) => set("author", e.target.value)}
              placeholder="Author name or team"
              className={INPUT}
            />
          </Field>
          <Field label="Version">
            <input
              value={form.version}
              onChange={(e) => set("version", e.target.value)}
              placeholder="1.0.0"
              className={INPUT}
            />
          </Field>
        </div>

        {/* Dependencies */}
        {otherFragments.length > 0 && (
          <section>
            <Label>Dependencies</Label>
            <p className="text-xs text-zinc-600 mb-2">
              These fragments will be required when this one is compiled.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {otherFragments.map((f) => (
                <button
                  key={f.id}
                  onClick={() => toggleDep(f.id)}
                  className={`rounded-full px-2.5 py-1 text-xs border transition-colors ${
                    form.depends_on.includes(f.id)
                      ? "border-indigo-500 bg-indigo-900/40 text-indigo-300"
                      : "border-zinc-700 text-zinc-400 hover:border-zinc-500"
                  }`}
                >
                  {f.id}
                </button>
              ))}
            </div>
          </section>
        )}

        {/* Replace blocks */}
        {(otherFragments.length > 0 || true) && (
          <section>
            <Label>Replace Blocks</Label>
            <p className="text-xs text-zinc-600 mb-2">
              When checked, this fragment&apos;s content replaces (rather than appends to)
              content from higher-priority tiers.
            </p>
            <div className="flex gap-4">
              {(["identity", "context", "steps"] as const).map((block) => (
                <label
                  key={block}
                  className="flex items-center gap-1.5 text-xs text-zinc-300 cursor-pointer select-none"
                >
                  <input
                    type="checkbox"
                    checked={form.replace_blocks.includes(block)}
                    onChange={() => {
                      const next = form.replace_blocks.includes(block)
                        ? form.replace_blocks.filter((b) => b !== block)
                        : [...form.replace_blocks, block];
                      set("replace_blocks", next);
                    }}
                    className="rounded border-zinc-600 bg-zinc-800 text-indigo-500"
                  />
                  {block}
                </label>
              ))}
            </div>
          </section>
        )}

        {/* Content blocks */}
        <section>
          <Label>Content Blocks</Label>
          <div className="space-y-3 mt-2">
            <BlockField
              label="Identity"
              hint="Who or what the AI is"
              value={form.identity}
              onChange={(v) => set("identity", v)}
            />
            <BlockField
              label="Context"
              hint="Background knowledge and assumptions"
              value={form.context}
              onChange={(v) => set("context", v)}
            />
            <BlockField
              label="Steps"
              hint="Process instructions"
              value={form.steps}
              onChange={(v) => set("steps", v)}
            />
          </div>
        </section>

        {/* Rules */}
        <section>
          <div className="flex items-center justify-between mb-2">
            <Label>Rules</Label>
            <button
              onClick={addRule}
              className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
            >
              + Add Rule
            </button>
          </div>
          {form.rules.length === 0 ? (
            <p className="text-xs text-zinc-600 py-2">
              No rules yet — rules are directive constraints applied to the compiled prompt.
            </p>
          ) : (
            <div className="space-y-2">
              {form.rules.map((rule, idx) => (
                <div
                  key={idx}
                  className="flex gap-2 items-start rounded-lg border border-zinc-700/60 bg-zinc-800/40 p-3"
                >
                  <div className="flex flex-col gap-1.5 flex-1 min-w-0">
                    <input
                      value={rule.key}
                      onChange={(e) => updateRule(idx, "key", e.target.value)}
                      placeholder="key (optional — enables override by later tiers)"
                      className={INPUT + " text-xs font-mono"}
                    />
                    <textarea
                      value={rule.content}
                      onChange={(e) => updateRule(idx, "content", e.target.value)}
                      placeholder="Rule content (required)"
                      rows={2}
                      className={TEXTAREA + " text-xs"}
                    />
                  </div>
                  <button
                    onClick={() => removeRule(idx)}
                    className="shrink-0 mt-0.5 text-zinc-500 hover:text-red-400 transition-colors"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Fragment History Viewer Modal */}
      {fragmentId && (
        <FragmentHistoryViewer
          fragmentId={fragmentId}
          currentFragment={{
            id: form.id,
            tier: form.tier,
            meta: {
              version: form.version,
              description: form.description,
              tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean),
              author: form.author,
              updated: new Date().toISOString().split("T")[0],
              fabric_source: form.fabric_source || null,
            },
            depends_on: form.depends_on,
            replace_blocks: form.replace_blocks,
            blocks: {
              identity: form.identity || null,
              context: form.context || null,
              steps: form.steps || null,
              rules: form.rules
                .filter((r) => r.content.trim())
                .map((r) => ({
                  ...(r.key.trim() ? { key: r.key.trim() } : {}),
                  content: r.content.trim(),
                })),
            },
          }}
          isOpen={showHistory}
          onClose={() => setShowHistory(false)}
          onRestore={handleRestoreFromHistory}
        />
      )}
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
      {children}
    </h4>
  );
}

function Field({
  label,
  required,
  className,
  children,
}: {
  label: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <label className="block text-xs font-medium text-zinc-400 mb-1.5">
        {label}
        {required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

function BlockField({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <div className="flex items-baseline gap-2 mb-1.5">
        <span className="text-xs font-medium text-zinc-400">{label}</span>
        <span className="text-[10px] text-zinc-600">{hint}</span>
      </div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={`${label} content…`}
        rows={3}
        className={
          "w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-y"
        }
      />
    </div>
  );
}
