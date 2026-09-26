import type { UsageInfo } from "@/lib/usage";
import { formatCost } from "@/lib/usage";

export function UsageBadge({ usage }: { usage: UsageInfo | null }) {
  if (!usage) return null;

  return (
    <p className="mt-3 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 font-mono text-xs text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400">
      {usage.model} · {usage.totalTokens} tokens (in {usage.promptTokens} / out{" "}
      {usage.completionTokens}) · ~{formatCost(usage.estimatedCostUsd)}
    </p>
  );
}
