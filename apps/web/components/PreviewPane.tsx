"use client";

import { useState } from "react";
import type { CompileResult } from "@/lib/types";

interface Props {
  result: CompileResult | null;
  isLoading: boolean;
  previewError?: string | null;
}

type OutputTab = "markdown" | "openai" | "manifest";

function copyToClipboard(text: string) {
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text).catch(() => {
      copyToClipboardFallback(text);
    });
  } else {
    copyToClipboardFallback(text);
  }
}

function copyToClipboardFallback(text: string) {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  try {
    document.execCommand("copy");
  } finally {
    document.body.removeChild(textarea);
  }
}

function downloadFile(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  // Must be appended to the DOM for Firefox compatibility
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function PreviewPane({ result, isLoading, previewError }: Props) {
  const [activeTab, setActiveTab] = useState<OutputTab>("markdown");
  const [copied, setCopied] = useState(false);

  const tabs: { id: OutputTab; label: string }[] = [
    { id: "markdown", label: "Markdown" },
    { id: "openai", label: "OpenAI JSON" },
    { id: "manifest", label: "Manifest" },
  ];

  const handleCopy = () => {
    if (!result) return;
    const text =
      activeTab === "markdown"
        ? result.markdown
        : activeTab === "openai"
          ? JSON.stringify(result.openAIMessage, null, 2)
          : JSON.stringify(result.manifest, null, 2);
    copyToClipboard(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    if (!result) return;
    if (activeTab === "markdown") {
      downloadFile(result.markdown, "system-prompt.md", "text/markdown");
    } else if (activeTab === "openai") {
      downloadFile(
        JSON.stringify(result.openAIMessage, null, 2),
        "system-prompt.json",
        "application/json"
      );
    } else {
      downloadFile(
        JSON.stringify(result.manifest, null, 2),
        "compilation-manifest.json",
        "application/json"
      );
    }
  };

  const activeContent = result
    ? activeTab === "markdown"
      ? result.markdown
      : JSON.stringify(
          activeTab === "openai" ? result.openAIMessage : result.manifest,
          null,
          2
        )
    : "";

  const hasConflicts =
    (result?.manifest.conflictResolutions.length ?? 0) > 0;
  const hasMissingDeps =
    (result?.manifest.missingDependencies.length ?? 0) > 0;

  return (
    <div className="flex flex-col h-full gap-2">
      {/* Tab bar + actions */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex rounded-md bg-zinc-800 p-0.5 gap-0.5">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-3 py-1 text-xs rounded transition-colors ${
                activeTab === tab.id
                  ? "bg-indigo-600 text-white"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {result && (
          <div className="flex gap-2">
            <button
              onClick={handleCopy}
              className="px-3 py-1 text-xs rounded bg-zinc-700 text-zinc-300 hover:bg-zinc-600 transition-colors"
            >
              {copied ? "Copied!" : "Copy"}
            </button>
            <button
              onClick={handleDownload}
              className="px-3 py-1 text-xs rounded bg-zinc-700 text-zinc-300 hover:bg-zinc-600 transition-colors"
            >
              Download
            </button>
          </div>
        )}
      </div>

      {/* Warnings */}
      {hasConflicts && (
        <div className="rounded-md border border-amber-700/50 bg-amber-900/20 px-3 py-2 text-xs text-amber-300">
          <strong>Rule conflicts resolved:</strong>{" "}
          {result!.manifest.conflictResolutions.map((c) => (
            <span key={c.key} className="mr-2">
              <code>{c.key}</code> → <code>{c.winner}</code> won over{" "}
              {c.overrode.join(", ")}
            </span>
          ))}
        </div>
      )}
      {hasMissingDeps && (
        <div className="rounded-md border border-red-700/50 bg-red-900/20 px-3 py-2 text-xs text-red-300">
          <strong>Missing dependencies:</strong>{" "}
          {result!.manifest.missingDependencies.map((d) => (
            <span key={d.fragmentId} className="mr-2">
              <code>{d.fragmentId}</code> requires:{" "}
              {d.missingIds.join(", ")}
            </span>
          ))}
        </div>
      )}

      {/* Content area */}
      <div className="flex-1 relative rounded-md border border-zinc-700 bg-zinc-900 overflow-hidden">
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-zinc-900/80 z-10">
            <div className="h-5 w-5 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
          </div>
        )}
        {!isLoading && previewError && (
          <div className="absolute inset-0 flex items-start justify-start p-4">
            <div className="rounded-md border border-red-700/50 bg-red-900/20 px-3 py-2 text-xs text-red-300 max-w-full">
              <strong>Compilation error:</strong> {previewError}
            </div>
          </div>
        )}

        {!result && !isLoading && (
          <div className="flex h-full items-center justify-center text-sm text-zinc-600">
            Select fragments to compile a prompt.
          </div>
        )}

        {activeContent && (
          <pre className="h-full overflow-auto p-4 text-sm leading-relaxed text-zinc-200 font-mono whitespace-pre-wrap">
            {activeContent}
          </pre>
        )}
      </div>
    </div>
  );
}
