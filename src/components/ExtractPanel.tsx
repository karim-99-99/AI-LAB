"use client";

import { useEffect, useState } from "react";
import { practiceHeaders } from "@/lib/client-headers";
import type { ExtractionOutput } from "@/lib/schemas";
import type { UsageInfo } from "@/lib/usage";
import { UsageBadge } from "./UsageBadge";

type Saved = {
  id: string;
  createdAt: string;
  type: string;
  data: Record<string, unknown>;
};

export function ExtractPanel() {
  const [text, setText] = useState(
    "Invoice #INV-1042 from Acme Supplies dated 2026-03-01. Total $450.00 USD. Items: Paper reams $120, Toner $330."
  );
  const [kind, setKind] = useState<"invoice" | "form">("invoice");
  const [extraction, setExtraction] = useState<ExtractionOutput | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [history, setHistory] = useState<Saved[]>([]);
  const [usage, setUsage] = useState<UsageInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadHistory() {
    try {
      const res = await fetch("/api/extract", { headers: practiceHeaders() });
      const data = await res.json();
      if (res.ok) setHistory(data.extractions ?? []);
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    void loadHistory();
  }, []);

  async function run() {
    if (!text.trim() || loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/extract", {
        method: "POST",
        headers: practiceHeaders(),
        body: JSON.stringify({ text, kind }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Request failed");
      setExtraction(data.extraction);
      setSavedId(data.id);
      setUsage(data.usage);
      await loadHistory();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Extract failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-zinc-500">
        Extract invoice/form JSON → validate with Zod → save to the local store.
      </p>
      <select
        value={kind}
        onChange={(e) => setKind(e.target.value as "invoice" | "form")}
        className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900"
      >
        <option value="invoice">Invoice</option>
        <option value="form">Form</option>
      </select>
      <textarea
        className="min-h-36 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-600 dark:border-zinc-600 dark:bg-zinc-900"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <button
        type="button"
        onClick={run}
        disabled={loading || !text.trim()}
        className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {loading ? "Extracting…" : "Extract → save"}
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {extraction && (
        <pre className="overflow-x-auto rounded-lg border border-zinc-200 bg-white p-4 text-xs dark:border-zinc-700 dark:bg-zinc-950">
          {JSON.stringify({ id: savedId, ...extraction }, null, 2)}
        </pre>
      )}
      {history.length > 0 && (
        <div className="space-y-1 text-xs text-zinc-600 dark:text-zinc-400">
          <p className="font-semibold">Saved extractions ({history.length})</p>
          {history.slice(0, 5).map((h) => (
            <p key={h.id}>
              {h.createdAt.slice(0, 19)} · {h.type} · {h.id}
            </p>
          ))}
        </div>
      )}
      <UsageBadge usage={usage} />
    </div>
  );
}
