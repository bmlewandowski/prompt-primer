"use client";

interface Props {
  tokenCount: number;
  tokenBudget: number;
}

const WARNING_THRESHOLD = 0.8;
const ERROR_THRESHOLD = 1.0;

export function TokenBudget({ tokenCount, tokenBudget }: Props) {
  const ratio = tokenBudget > 0 ? tokenCount / tokenBudget : 0;
  const percentage = Math.min(ratio * 100, 100);

  const barColor =
    ratio >= ERROR_THRESHOLD
      ? "bg-red-500"
      : ratio >= WARNING_THRESHOLD
        ? "bg-amber-500"
        : "bg-indigo-500";

  const textColor =
    ratio >= ERROR_THRESHOLD
      ? "text-red-400"
      : ratio >= WARNING_THRESHOLD
        ? "text-amber-400"
        : "text-zinc-400";

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-zinc-400 font-medium">Token Budget</span>
        <span className={`font-mono font-semibold ${textColor}`}>
          {tokenCount.toLocaleString()} / {tokenBudget.toLocaleString()}
          {ratio >= ERROR_THRESHOLD && (
            <span className="ml-1 text-red-400">⚠ Over budget</span>
          )}
        </span>
      </div>
      <div className="h-2 w-full rounded-full bg-zinc-700 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-300 ${barColor}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}
