"use client";

import { useState } from "react";
import { practiceHeaders } from "@/lib/client-headers";
import type { GrammarOutput } from "@/lib/schemas";
import type { UsageInfo } from "@/lib/usage";
import { UsageBadge } from "./UsageBadge";

export function GrammarPanel() {
  const [text, setText] = useState("");
  const [result, setResult] = useState<GrammarOutput | null>(null);
  const [usage, setUsage] = useState<UsageInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    if (!text.trim() || loading) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/grammar", {
        method: "POST",
        headers: practiceHeaders(),
        body: JSON.stringify({ text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Request failed");

      setResult(data.result);
      setUsage(data.usage);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Grammar failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <textarea
        className="min-h-40 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-600 dark:border-zinc-600 dark:bg-zinc-900"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Paste draft text with grammar mistakes…"
        disabled={loading}
      />
      <button
        type="button"
        onClick={run}
        disabled={loading || !text.trim()}
        className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {loading ? "Checking…" : "Check grammar"}
      </button>

      {result && (
        <div className="space-y-4">
          <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 text-sm whitespace-pre-wrap dark:border-zinc-700 dark:bg-zinc-900">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Corrected
            </p>
            {result.corrected}
          </div>

          {result.issues.length > 0 && (
            <ul className="space-y-2">
              {result.issues.map((issue, i) => (
                <li
                  key={i}
                  className="rounded-md border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-700"
                >
                  <p>
                    <span className="text-red-600 line-through">
                      {issue.original}
                    </span>
                    {" → "}
                    <span className="text-emerald-700 dark:text-emerald-400">
                      {issue.suggestion}
                    </span>
                  </p>
                  <p className="mt-1 text-xs text-zinc-500">{issue.reason}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
      <UsageBadge usage={usage} />
    </div>
  );
}
