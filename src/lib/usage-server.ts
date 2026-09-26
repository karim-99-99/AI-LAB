import { appendUsageEvent } from "./usage-log";
import { buildUsage, type UsageInfo } from "./usage";

/** Server-only: build usage + persist to dashboard log. */
export function buildAndLogUsage(
  model: string,
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  } | null,
  meta?: {
    route?: string;
    ok?: boolean;
    latencyMs?: number;
    requestId?: string;
  }
): UsageInfo {
  const info = buildUsage(model, usage);
  console.log("[AI usage]", {
    ...info,
    route: meta?.route,
    requestId: meta?.requestId,
    latencyMs: meta?.latencyMs,
  });

  if (meta?.route) {
    void appendUsageEvent(info, {
      route: meta.route,
      ok: meta.ok ?? true,
      latencyMs: meta.latencyMs,
      requestId: meta.requestId,
    }).catch((err) => console.error("[usage-log]", err));
  }

  return info;
}
