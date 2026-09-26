/**
 * Client-safe usage helpers (no Node fs).
 * Server routes that need persistence should use buildAndLogUsage.
 */
const MODEL_PRICING: Record<
  string,
  { inputPerMillion: number; outputPerMillion: number }
> = {
  "gpt-4o-mini": { inputPerMillion: 0.15, outputPerMillion: 0.6 },
  "gpt-4o": { inputPerMillion: 2.5, outputPerMillion: 10 },
  "llama-3.1-8b-instant": { inputPerMillion: 0, outputPerMillion: 0 },
  "llama-3.3-70b-versatile": { inputPerMillion: 0, outputPerMillion: 0 },
  "openai/gpt-oss-20b": { inputPerMillion: 0, outputPerMillion: 0 },
  "openai/gpt-oss-120b": { inputPerMillion: 0, outputPerMillion: 0 },
  "qwen/qwen3.6-27b": { inputPerMillion: 0, outputPerMillion: 0 },
};

export type UsageInfo = {
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
};

export function buildUsage(
  model: string,
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  } | null
): UsageInfo {
  const promptTokens = usage?.prompt_tokens ?? 0;
  const completionTokens = usage?.completion_tokens ?? 0;
  const totalTokens = usage?.total_tokens ?? promptTokens + completionTokens;

  const pricing =
    MODEL_PRICING[model] ?? ({ inputPerMillion: 0, outputPerMillion: 0 } as const);
  const estimatedCostUsd =
    (promptTokens / 1_000_000) * pricing.inputPerMillion +
    (completionTokens / 1_000_000) * pricing.outputPerMillion;

  return {
    model,
    promptTokens,
    completionTokens,
    totalTokens,
    estimatedCostUsd: Number(estimatedCostUsd.toFixed(8)),
  };
}

export function formatCost(usd: number): string {
  if (usd <= 0) return "$0 (free tier)";
  if (usd < 0.0001) return `$${usd.toFixed(8)}`;
  return `$${usd.toFixed(6)}`;
}

export function newRequestId(): string {
  return `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}
