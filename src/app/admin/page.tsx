"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { practiceHeaders } from "@/lib/client-headers";
import { formatCost } from "@/lib/usage";

type Summary = {
  totalRequests: number;
  totalTokens: number;
  totalCostUsd: number;
  errors: number;
  byRoute: { route: string; count: number }[];
  byModel: { model: string; count: number }[];
  recent: {
    id: string;
    createdAt: string;
    route: string;
    model: string;
    totalTokens: number;
    estimatedCostUsd: number;
    ok: boolean;
    latencyMs?: number;
    requestId?: string;
  }[];
};

type RouteRow = { task: string; tier: string; model: string };

type GuardrailsInfo = {
  maxInputChars: number;
  maxOutputChars: number;
  maxOutputTokens: number;
  blockedTopics: string[];
  injectionChecks: string[];
  owaspSkim?: string;
};

export default function AdminPage() {
  const [data, setData] = useState<Summary | null>(null);
  const [routes, setRoutes] = useState<RouteRow[]>([]);
  const [guardrails, setGuardrails] = useState<GuardrailsInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [usageRes, routingRes, guardRes] = await Promise.all([
        fetch("/api/admin/usage", { headers: practiceHeaders() }),
        fetch("/api/admin/routing", { headers: practiceHeaders() }),
        fetch("/api/admin/guardrails", { headers: practiceHeaders() }),
      ]);
      const json = await usageRes.json();
      if (!usageRes.ok) throw new Error(json.error || "Failed to load");
      setData(json);
      if (routingRes.ok) {
        const r = await routingRes.json();
        setRoutes(r.routes ?? []);
      }
      if (guardRes.ok) {
        setGuardrails(await guardRes.json());
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-8 md:py-12">
      <header className="lab-animate-in space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--lab-accent)]">
          Operations
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">Usage dashboard</h1>
        <p className="text-sm text-[var(--lab-ink-muted)]">
          Requests, tokens, cost, model routing, and LLM guardrails.{" "}
          <Link href="/" className="underline">
            Back to Studio
          </Link>
        </p>
      </header>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => void load()}
          className="lab-btn-primary px-3 py-1.5 text-sm"
        >
          Refresh
        </button>
      </div>

      {loading && <p className="text-sm text-zinc-500">Loading…</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      {data && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Requests" value={String(data.totalRequests)} />
            <Stat label="Tokens" value={String(data.totalTokens)} />
            <Stat label="Est. cost" value={formatCost(data.totalCostUsd)} />
            <Stat label="Errors" value={String(data.errors)} />
          </div>

          <section className="space-y-2">
            <h2 className="text-sm font-semibold">LLM guardrails</h2>
            {guardrails ? (
              <div className="space-y-2 rounded-lg border border-sky-200 bg-sky-50 p-4 text-xs dark:border-sky-800 dark:bg-sky-950/40">
                <p>
                  Max input: {guardrails.maxInputChars} chars · Max output:{" "}
                  {guardrails.maxOutputChars} chars · max_tokens:{" "}
                  {guardrails.maxOutputTokens}
                </p>
                <p>
                  Injection checks:{" "}
                  <span className="font-mono">
                    {guardrails.injectionChecks.join(", ")}
                  </span>
                </p>
                <p>
                  Blocked topics:{" "}
                  <span className="font-mono">
                    {guardrails.blockedTopics.join(" · ") || "(none)"}
                  </span>
                </p>
                {guardrails.owaspSkim && (
                  <a
                    className="underline"
                    href={guardrails.owaspSkim}
                    target="_blank"
                    rel="noreferrer"
                  >
                    OWASP Top 10 for LLM Apps (skim)
                  </a>
                )}
              </div>
            ) : (
              <p className="text-xs text-zinc-500">Guardrails info unavailable.</p>
            )}
          </section>

          <section className="space-y-2">
            <h2 className="text-sm font-semibold">Model routing</h2>
            <p className="text-xs text-zinc-500">
              Fixed task → fast/strong table (not an AI choosing live).
            </p>
            <ul className="max-h-64 space-y-1 overflow-y-auto text-xs">
              {routes.map((r) => (
                <li
                  key={r.task}
                  className="flex flex-wrap justify-between gap-2 rounded border border-zinc-200 px-3 py-2 dark:border-zinc-700"
                >
                  <span className="font-mono">{r.task}</span>
                  <span>
                    <span
                      className={
                        r.tier === "strong"
                          ? "text-amber-700 dark:text-amber-300"
                          : "text-emerald-700 dark:text-emerald-300"
                      }
                    >
                      {r.tier}
                    </span>{" "}
                    · {r.model}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section className="space-y-2">
            <h2 className="text-sm font-semibold">By route</h2>
            <ul className="space-y-1 text-sm">
              {data.byRoute.length === 0 && (
                <li className="text-zinc-500">No events yet — use AI Lab once.</li>
              )}
              {data.byRoute.map((r) => (
                <li
                  key={r.route}
                  className="flex justify-between rounded border border-zinc-200 px-3 py-2 dark:border-zinc-700"
                >
                  <span className="font-mono text-xs">{r.route}</span>
                  <span>{r.count}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="space-y-2">
            <h2 className="text-sm font-semibold">By model</h2>
            <ul className="space-y-1 text-sm">
              {data.byModel.map((m) => (
                <li
                  key={m.model}
                  className="flex justify-between rounded border border-zinc-200 px-3 py-2 dark:border-zinc-700"
                >
                  <span className="font-mono text-xs">{m.model}</span>
                  <span>{m.count}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="space-y-2">
            <h2 className="text-sm font-semibold">Recent calls</h2>
            <ul className="max-h-96 space-y-2 overflow-y-auto text-xs">
              {data.recent.map((e) => (
                <li
                  key={e.id}
                  className="rounded border border-zinc-200 p-3 dark:border-zinc-700"
                >
                  <p className="font-semibold">
                    {e.ok ? "OK" : "ERR"} · {e.route} · {e.totalTokens} tok ·{" "}
                    {formatCost(e.estimatedCostUsd)}
                    {e.latencyMs != null ? ` · ${e.latencyMs}ms` : ""}
                  </p>
                  <p className="mt-1 text-zinc-500">
                    {e.createdAt} · {e.model}
                    {e.requestId ? ` · ${e.requestId}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-950">
      <p className="text-[11px] uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-1 text-xl font-semibold">{value}</p>
    </div>
  );
}
