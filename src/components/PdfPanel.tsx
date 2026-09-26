"use client";

import { useState } from "react";
import { practiceHeaders } from "@/lib/client-headers";
import type { UsageInfo } from "@/lib/usage";
import { UsageBadge } from "./UsageBadge";

export function PdfPanel() {
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState("short");
  const [summary, setSummary] = useState("");
  const [truncated, setTruncated] = useState(false);
  const [usage, setUsage] = useState<UsageInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    if (!file || loading) return;
    setLoading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("mode", mode);

      const headers: Record<string, string> = {};
      const key = process.env.NEXT_PUBLIC_PRACTICE_API_KEY?.trim();
      if (key) headers["x-practice-key"] = key;

      const res = await fetch("/api/pdf-summarize", {
        method: "POST",
        headers,
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Request failed");
      setSummary(data.summary);
      setTruncated(Boolean(data.truncated));
      setUsage(data.usage);
    } catch (err) {
      setError(err instanceof Error ? err.message : "PDF summarize failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-zinc-500">
        Upload a text PDF (under 5MB). Text is extracted locally, then summarized by Groq.
      </p>
      <input
        type="file"
        accept="application/pdf"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        className="block w-full text-sm"
      />
      <select
        value={mode}
        onChange={(e) => setMode(e.target.value)}
        className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900"
      >
        <option value="short">Short</option>
        <option value="medium">Medium</option>
        <option value="bullets">Bullets</option>
      </select>
      <button
        type="button"
        onClick={run}
        disabled={loading || !file}
        className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {loading ? "Summarizing…" : "Summarize PDF"}
      </button>
      {truncated && (
        <p className="text-xs text-amber-700">Text was truncated for model context.</p>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
      {summary && (
        <pre className="whitespace-pre-wrap rounded-lg border border-zinc-200 bg-white p-4 text-sm dark:border-zinc-700 dark:bg-zinc-950">
          {summary}
        </pre>
      )}
      <UsageBadge usage={usage} />
    </div>
  );
}
