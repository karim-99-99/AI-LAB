"use client";

import { useState } from "react";
import { practiceHeaders } from "@/lib/client-headers";
import type { UsageInfo } from "@/lib/usage";
import { UsageBadge } from "./UsageBadge";

export function SummarizePanel() {
  const [text, setText] = useState("");
  const [summary, setSummary] = useState("");
  const [usage, setUsage] = useState<UsageInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    if (!text.trim() || loading) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/summarize", {
        method: "POST",
        headers: practiceHeaders(),
        body: JSON.stringify({ text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Request failed");

      setSummary(data.summary);
      setUsage(data.usage);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Summarize failed");
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
        placeholder="Paste a long article or notes to summarize…"
        disabled={loading}
      />
      <button
        type="button"
        onClick={run}
        disabled={loading || !text.trim()}
        className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {loading ? "Summarizing…" : "Summarize"}
      </button>

      {summary && (
        <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 text-sm whitespace-pre-wrap dark:border-zinc-700 dark:bg-zinc-900">
          {summary}
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
      <UsageBadge usage={usage} />
    </div>
  );
}
