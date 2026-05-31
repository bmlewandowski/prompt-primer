"use client";

import { useState, useMemo, useEffect } from "react";
import type { CompileResult, LintWarning } from "@/lib/types";
import { computeDiff } from "@/lib/diff";

interface Props {
  result: (CompileResult & { lintWarnings?: LintWarning[] }) | null;
  previousResult: (CompileResult & { lintWarnings?: LintWarning[] }) | null;
  isLoading: boolean;
  previewError?: string | null;
}

type OutputTab = "markdown" | "openai" | "manifest" | "quality";

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

export function PreviewPane({ result, previousResult, isLoading, previewError }: Props) {
  const [activeTab, setActiveTab] = useState<OutputTab>("markdown");
  const [copied, setCopied] = useState(false);
  const [showDiff, setShowDiff] = useState(true);

  // Compute diff when needed
  const diffLines = useMemo(() => {
    if (!result || !previousResult) return null;
    return computeDiff(previousResult.markdown, result.markdown);
  }, [result, previousResult]);

  // Reset to diff view whenever we get a new diff
  useEffect(() => {
    if (diffLines && diffLines.length > 0) {
      setShowDiff(true);
    }
  }, [diffLines]);

  const tabs: { id: OutputTab; label: string; title: string }[] = [
    { id: "markdown", label: "Prompt Text", title: "Compiled prompt in the selected output format" },
    { id: "openai", label: "OpenAI JSON", title: "{role: system, content: \"…\"} — ready to paste into the OpenAI API" },
    { id: "manifest", label: "Manifest", title: "Compilation metadata: token count, dependencies, conflicts" },
    { id: "quality", label: "Quality", title: "Fragment quality analysis and linting suggestions" },
  ];

  const handleCopy = () => {
    if (!result) return;
    if (activeTab === "quality") return; // quality tab doesn't support copy
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
    if (activeTab === "quality") return; // quality tab doesn't support download
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

  const activeContent = result && activeTab !== "quality"
    ? activeTab === "markdown"
      ? result.markdown
      : JSON.stringify(
          activeTab === "openai" ? result.openAIMessage : result.manifest,
          null,
          2
        )
    : "";

  const lintWarnings = result?.lintWarnings || [];
  const errorCount = lintWarnings.filter((w) => w.severity === "error").length;
  const warningCount = lintWarnings.filter((w) => w.severity === "warning").length;
  const infoCount = lintWarnings.filter((w) => w.severity === "info").length;

  const hasConflicts =
    (result?.manifest.conflictResolutions.length ?? 0) > 0;
  const hasMissingDeps =
    (result?.manifest.missingDependencies.length ?? 0) > 0;
  const hasCircularDeps =
    (result?.manifest.circularDependencies?.length ?? 0) > 0;

  return (
    <div className="flex flex-col h-full gap-2">
      {/* Tab bar + actions */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex rounded-md bg-zinc-800 p-0.5 gap-0.5">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              title={tab.title}
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
      {hasCircularDeps && (
        <div className="rounded-md border border-orange-700/50 bg-orange-900/20 px-3 py-2 text-xs text-orange-300">
          <strong>Circular dependencies detected:</strong>{" "}
          {result!.manifest.circularDependencies!.map((c, i) => (
            <span key={i} className="mr-2">
              [{c.cycle.join(" → ")} → {c.cycle[0]}]
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

        {activeTab === "quality" && result && (
          <div className="h-full overflow-auto p-4">
            {lintWarnings.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <svg className="w-16 h-16 text-green-500 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <h3 className="text-lg font-semibold text-white mb-2">No Quality Issues Found</h3>
                <p className="text-sm text-zinc-400 max-w-md">
                  Your selected fragments follow best practices for identity clarity, rule length, and consistency.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center gap-4 text-xs pb-3 border-b border-zinc-800">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-white">Quality Analysis</span>
                  </div>
                  <div className="flex items-center gap-3 text-zinc-400">
                    {errorCount > 0 && (
                      <span className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-red-500"></span>
                        {errorCount} error{errorCount !== 1 ? "s" : ""}
                      </span>
                    )}
                    {warningCount > 0 && (
                      <span className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                        {warningCount} warning{warningCount !== 1 ? "s" : ""}
                      </span>
                    )}
                    {infoCount > 0 && (
                      <span className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                        {infoCount} info
                      </span>
                    )}
                  </div>
                </div>

                {lintWarnings.map((warning, idx) => {
                  const bgColor =
                    warning.severity === "error"
                      ? "bg-red-900/20 border-red-700/50"
                      : warning.severity === "warning"
                        ? "bg-amber-900/20 border-amber-700/50"
                        : "bg-blue-900/20 border-blue-700/50";
                  const textColor =
                    warning.severity === "error"
                      ? "text-red-300"
                      : warning.severity === "warning"
                        ? "text-amber-300"
                        : "text-blue-300";
                  const badgeColor =
                    warning.severity === "error"
                      ? "bg-red-600"
                      : warning.severity === "warning"
                        ? "bg-amber-600"
                        : "bg-blue-600";

                  return (
                    <div
                      key={idx}
                      className={`rounded-md border ${bgColor} p-3 text-xs ${textColor}`}
                    >
                      <div className="flex items-start gap-2">
                        <span className={`inline-block ${badgeColor} text-white px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase shrink-0`}>
                          {warning.severity}
                        </span>
                        <div className="flex-1 space-y-1">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <span className="font-mono text-white">{warning.fragmentId}</span>
                              <span className="text-zinc-500 mx-2">•</span>
                              <span className="text-zinc-400 capitalize">{warning.category}</span>
                            </div>
                          </div>
                          <p className="text-white font-medium">{warning.message}</p>
                          {warning.suggestion && (
                            <p className="text-zinc-300 mt-2 pl-3 border-l-2 border-zinc-700">
                              <span className="font-semibold">Suggestion:</span> {warning.suggestion}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Markdown tab with optional diff view */}
        {activeTab === "markdown" && result && (
          <>
            {showDiff && diffLines && diffLines.length > 0 ? (
              <div 
                className="h-full overflow-auto cursor-pointer"
                onClick={(e) => {
                  // Only dismiss if clicking on text area, not while selecting text
                  if (window.getSelection()?.toString()) return;
                  setShowDiff(false);
                }}
                title="Click to view normal text"
              >
                {/* Diff mode indicator */}
                <div className="sticky top-0 flex justify-center p-3 pointer-events-none z-10">
                  <div className="px-4 py-2 rounded-md bg-zinc-800/90 backdrop-blur-sm border border-zinc-700/50 text-zinc-300 text-sm shadow-lg">
                    showing changes • click to dismiss
                  </div>
                </div>
                <div className="font-mono text-xs leading-relaxed">
                  {diffLines.map((line, idx) => {
                    const bgColor =
                      line.type === "added"
                        ? "bg-green-900/40"
                        : line.type === "removed"
                          ? "bg-red-900/40"
                          : "";
                    const textColor =
                      line.type === "added"
                        ? "text-green-200"
                        : line.type === "removed"
                          ? "text-red-200"
                          : "text-zinc-300";
                    const prefix = line.type === "added" ? "+ " : line.type === "removed" ? "- " : "  ";
                    
                    return (
                      <div
                        key={idx}
                        className={`px-4 py-0.5 ${bgColor} ${textColor} whitespace-pre-wrap border-l-2 ${
                          line.type === "added"
                            ? "border-green-500"
                            : line.type === "removed"
                              ? "border-red-500"
                              : "border-transparent"
                        }`}
                      >
                        <span className="select-none mr-2 inline-block w-4 font-bold">{prefix}</span>
                        <span>{line.content}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <pre className="h-full overflow-auto p-4 text-sm leading-relaxed text-zinc-200 font-mono whitespace-pre-wrap">
                {result.markdown}
              </pre>
            )}
          </>
        )}

        {activeTab !== "markdown" && activeContent && (
          <pre className="h-full overflow-auto p-4 text-sm leading-relaxed text-zinc-200 font-mono whitespace-pre-wrap">
            {activeContent}
          </pre>
        )}
      </div>
    </div>
  );
}
