"use client";

import { useState, useEffect } from "react";
import ReactDiffViewer from "react-diff-viewer-continued";
import { stringify } from "yaml";
import type { Fragment } from "@prompt-primer/compiler";

interface FragmentRevision {
  timestamp: string;
  fragment: Fragment;
  note?: string;
}

interface Props {
  fragmentId: string;
  currentFragment: Fragment;
  isOpen: boolean;
  onClose: () => void;
  onRestore: (fragment: Fragment) => void;
}

export function FragmentHistoryViewer({
  fragmentId,
  currentFragment,
  isOpen,
  onClose,
  onRestore,
}: Props) {
  const [history, setHistory] = useState<FragmentRevision[]>([]);
  const [selectedRevision, setSelectedRevision] = useState<FragmentRevision | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDiff, setShowDiff] = useState(true);

  useEffect(() => {
    if (isOpen) {
      loadHistory();
    }
  }, [isOpen, fragmentId]);

  const loadHistory = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/fragments/${fragmentId}/history`);
      if (!res.ok) throw new Error("Failed to load history");
      const data = await res.json();
      setHistory(data.history || []);
      if (data.history?.length > 0) {
        setSelectedRevision(data.history[0]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setIsLoading(false);
    }
  };

  const handleRestore = async (revision: FragmentRevision) => {
    if (!confirm(`Restore fragment to version from ${formatTimestamp(revision.timestamp)}?`)) {
      return;
    }

    try {
      const res = await fetch(
        `/api/fragments/${fragmentId}/history/${encodeURIComponent(revision.timestamp)}/restore`,
        { method: "POST" }
      );
      if (!res.ok) throw new Error("Failed to restore version");
      const data = await res.json();
      onRestore(data.fragment);
      onClose();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to restore");
    }
  };

  const formatTimestamp = (iso: string) => {
    const date = new Date(iso);
    return date.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  };

  const getYamlContent = (fragment: Fragment) => {
    return stringify(fragment, { lineWidth: 0 });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
      <div className="bg-zinc-900 rounded-lg shadow-2xl max-w-7xl w-full max-h-[90vh] flex flex-col border border-zinc-700">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
          <div>
            <h2 className="text-xl font-semibold text-white">Version History</h2>
            <p className="text-sm text-zinc-400 mt-1">
              Fragment: <code className="text-indigo-400">{fragmentId}</code>
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-white transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 flex overflow-hidden">
          {/* Sidebar: Version list */}
          <div className="w-80 border-r border-zinc-800 overflow-y-auto">
            <div className="p-4 border-b border-zinc-800">
              <div className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-2">
                {history.length} Revision{history.length !== 1 ? "s" : ""}
              </div>
              <label className="flex items-center gap-2 text-xs text-zinc-400">
                <input
                  type="checkbox"
                  checked={showDiff}
                  onChange={(e) => setShowDiff(e.target.checked)}
                  className="rounded"
                />
                Show diff view
              </label>
            </div>

            {isLoading && (
              <div className="p-4 text-center text-zinc-500">Loading history...</div>
            )}

            {error && (
              <div className="p-4 text-sm text-red-400">Error: {error}</div>
            )}

            {!isLoading && history.length === 0 && (
              <div className="p-4 text-center text-zinc-500">
                No version history yet.
              </div>
            )}

            <div className="divide-y divide-zinc-800">
              {/* Current version */}
              <button
                onClick={() => setSelectedRevision(null)}
                className={`w-full text-left px-4 py-3 transition-colors ${
                  selectedRevision === null
                    ? "bg-indigo-600/20 border-l-2 border-indigo-500"
                    : "hover:bg-zinc-800"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-white">Current Version</div>
                    <div className="text-xs text-zinc-400 mt-1">Active now</div>
                  </div>
                  <div className="px-2 py-0.5 rounded text-[10px] font-semibold bg-green-600 text-white">
                    CURRENT
                  </div>
                </div>
              </button>

              {history.map((revision, idx) => (
                <button
                  key={revision.timestamp}
                  onClick={() => setSelectedRevision(revision)}
                  className={`w-full text-left px-4 py-3 transition-colors ${
                    selectedRevision?.timestamp === revision.timestamp
                      ? "bg-indigo-600/20 border-l-2 border-indigo-500"
                      : "hover:bg-zinc-800"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-white">
                        Version {history.length - idx}
                      </div>
                      <div className="text-xs text-zinc-400 mt-1">
                        {formatTimestamp(revision.timestamp)}
                      </div>
                      {revision.note && (
                        <div className="text-xs text-zinc-500 mt-1 italic">
                          {revision.note}
                        </div>
                      )}
                    </div>
                    {selectedRevision?.timestamp === revision.timestamp && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRestore(revision);
                        }}
                        className="px-2 py-1 text-[10px] font-semibold rounded bg-indigo-600 hover:bg-indigo-500 text-white transition-colors"
                      >
                        RESTORE
                      </button>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Main area: Diff or full view */}
          <div className="flex-1 overflow-auto bg-zinc-950">
            {selectedRevision && showDiff ? (
              <div className="h-full">
                <ReactDiffViewer
                  oldValue={getYamlContent(selectedRevision.fragment)}
                  newValue={getYamlContent(currentFragment)}
                  splitView={true}
                  useDarkTheme={true}
                  leftTitle={`Version ${history.indexOf(selectedRevision) + 1} (${formatTimestamp(selectedRevision.timestamp)})`}
                  rightTitle="Current Version"
                  styles={{
                    variables: {
                      dark: {
                        diffViewerBackground: "#09090b",
                        diffViewerColor: "#e4e4e7",
                        addedBackground: "#052e16",
                        addedColor: "#bbf7d0",
                        removedBackground: "#450a0a",
                        removedColor: "#fca5a5",
                        wordAddedBackground: "#14532d",
                        wordRemovedBackground: "#7f1d1d",
                        addedGutterBackground: "#14532d",
                        removedGutterBackground: "#7f1d1d",
                        gutterBackground: "#18181b",
                        gutterBackgroundDark: "#09090b",
                        highlightBackground: "#27272a",
                        highlightGutterBackground: "#27272a",
                      },
                    },
                  }}
                />
              </div>
            ) : (
              <pre className="p-6 text-sm leading-relaxed text-zinc-200 font-mono whitespace-pre-wrap">
                {selectedRevision
                  ? getYamlContent(selectedRevision.fragment)
                  : getYamlContent(currentFragment)}
              </pre>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
