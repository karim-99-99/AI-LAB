"use client";

import { useCallback, useEffect, useState } from "react";
import { practiceHeaders } from "@/lib/client-headers";
import type { UsageInfo } from "@/lib/usage";
import { UsageBadge } from "./UsageBadge";

type ChunkMode = "basic" | "sentence_window" | "auto_merging";

type DocMeta = {
  id: string;
  filename: string;
  createdAt: string;
  charCount: number;
  chunkCount: number;
  embeddingModel: string;
  truncated: boolean;
  textPreview?: string;
  embeddingDims?: number;
  chunkMode?: ChunkMode;
  windowSize?: number;
  mergeThreshold?: number;
  parentChunkSize?: number;
  childChunkSize?: number;
  parentCount?: number;
};

type ChunkPreview = {
  id: string;
  index: number;
  text: string;
  windowText?: string;
  parentId?: string;
  parentIndex?: number;
  charStart: number;
  charEnd: number;
  embeddingDims: number;
};

type Retrieved = {
  documentId: string;
  filename: string;
  chunkId: string;
  index: number;
  text: string;
  matchedText?: string;
  mode?: ChunkMode;
  merged?: boolean;
  score: number;
};

type Citation = {
  n: number;
  filename: string;
  chunkIndex: number;
  chunkId: string;
  score: number;
  excerpt: string;
};

type EvalRow = {
  id: string;
  question: string;
  expect: string;
  note?: string;
  status: string;
  answer: string;
  bestScore: number;
  pass: boolean;
  retrievedCount: number;
  mergedCount: number;
  triad: {
    contextRelevance: number;
    groundedness: number;
    answerRelevance: number;
  } | null;
};

type EvalSummary = {
  total: number;
  passed: number;
  failed: number;
  avgBestScore: number;
  avgContextRelevance: number | null;
  avgGroundedness: number | null;
  avgAnswerRelevance: number | null;
};

function modeLabel(d: DocMeta): string {
  if (d.chunkMode === "sentence_window") {
    return `sentence-window±${d.windowSize ?? "?"}`;
  }
  if (d.chunkMode === "auto_merging") {
    return `auto-merge · ${d.parentCount ?? "?"}p/${d.chunkCount}c · thr ${d.mergeThreshold ?? 0.5}`;
  }
  return "basic";
}

export function RagIngestPanel() {
  const [file, setFile] = useState<File | null>(null);
  const [chunkMode, setChunkMode] = useState<ChunkMode>("basic");
  const [chunkSize, setChunkSize] = useState(800);
  const [overlap, setOverlap] = useState(120);
  const [windowSize, setWindowSize] = useState(3);
  const [parentSize, setParentSize] = useState(1600);
  const [childSize, setChildSize] = useState(400);
  const [mergeThreshold, setMergeThreshold] = useState(0.5);
  const [loading, setLoading] = useState(false);
  const [jobProgress, setJobProgress] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [evaluating, setEvaluating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [docs, setDocs] = useState<DocMeta[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [chunks, setChunks] = useState<ChunkPreview[]>([]);
  const [meta, setMeta] = useState<DocMeta | null>(null);

  const [question, setQuestion] = useState("");
  const [topK, setTopK] = useState(4);
  const [minScore, setMinScore] = useState(0.25);
  const [answer, setAnswer] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [retrieved, setRetrieved] = useState<Retrieved[]>([]);
  const [citations, setCitations] = useState<Citation[]>([]);
  const [bestScore, setBestScore] = useState<number | null>(null);
  const [usage, setUsage] = useState<UsageInfo | null>(null);
  const [cacheHit, setCacheHit] = useState<boolean | null>(null);
  const [cacheBackend, setCacheBackend] = useState<string | null>(null);

  const [evalRows, setEvalRows] = useState<EvalRow[]>([]);
  const [evalSummary, setEvalSummary] = useState<EvalSummary | null>(null);
  const [evalLimit, setEvalLimit] = useState(10);
  const [scoreTriad, setScoreTriad] = useState(true);

  const loadDocs = useCallback(async () => {
    try {
      const res = await fetch("/api/rag/documents", {
        headers: practiceHeaders(),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to list docs");
      setDocs(data.documents ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "List failed");
    }
  }, []);

  useEffect(() => {
    void loadDocs();
  }, [loadDocs]);

  async function loadChunks(id: string) {
    setSelectedId(id);
    setError(null);
    try {
      const res = await fetch(`/api/rag/documents?id=${encodeURIComponent(id)}`, {
        headers: practiceHeaders(),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load document");
      setMeta(data.document);
      setChunks(data.chunks ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Load chunks failed");
    }
  }

  async function ingest() {
    if (!file || loading) return;
    setLoading(true);
    setError(null);
    setNote(null);
    setJobProgress("Uploading + queueing job…");
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("mode", chunkMode);
      form.append("chunkSize", String(chunkSize));
      form.append("overlap", String(overlap));
      form.append("windowSize", String(windowSize));
      form.append("parentSize", String(parentSize));
      form.append("childSize", String(childSize));
      form.append("mergeThreshold", String(mergeThreshold));

      const headers: Record<string, string> = {};
      const key = process.env.NEXT_PUBLIC_PRACTICE_API_KEY?.trim();
      if (key) headers["x-practice-key"] = key;

      // Phase 5 Step 3: async ingest — returns immediately with jobId
      const res = await fetch("/api/rag/ingest/async", {
        method: "POST",
        headers,
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Ingest failed");

      const jobId = data.jobId as string;
      setNote(`Job started: ${jobId}`);
      setFile(null);

      // Poll until done/failed (background work continues on server)
      for (let i = 0; i < 120; i++) {
        await new Promise((r) => setTimeout(r, 1500));
        const jobRes = await fetch(
          `/api/rag/jobs?id=${encodeURIComponent(jobId)}`,
          { headers: practiceHeaders() }
        );
        const jobData = await jobRes.json();
        if (!jobRes.ok) throw new Error(jobData.error || "Job poll failed");
        const job = jobData.job as {
          status: string;
          progress: string;
          error?: string;
          result?: {
            note?: string;
            document?: DocMeta;
            chunks?: ChunkPreview[];
          };
        };
        setJobProgress(`${job.status}: ${job.progress}`);
        if (job.status === "done" && job.result) {
          setNote(job.result.note ?? "Ingested (async)");
          setMeta(job.result.document ?? null);
          setChunks(job.result.chunks ?? []);
          if (job.result.document?.id) {
            setSelectedId(job.result.document.id);
          }
          await loadDocs();
          setJobProgress(null);
          return;
        }
        if (job.status === "failed") {
          throw new Error(job.error || "Async ingest failed");
        }
      }
      throw new Error("Ingest timed out while polling job status");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ingest failed");
      setJobProgress(null);
    } finally {
      setLoading(false);
    }
  }

  async function removeDoc(id: string) {
    try {
      const res = await fetch(
        `/api/rag/documents?id=${encodeURIComponent(id)}`,
        { method: "DELETE", headers: practiceHeaders() }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Delete failed");
      if (selectedId === id) {
        setSelectedId(null);
        setChunks([]);
        setMeta(null);
      }
      await loadDocs();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  }

  async function ask() {
    if (!question.trim() || asking) return;
    setAsking(true);
    setError(null);
    setAnswer(null);
    setStatus(null);
    setRetrieved([]);
    setCitations([]);
    setUsage(null);
    setCacheHit(null);
    setCacheBackend(null);
    try {
      const res = await fetch("/api/rag/query", {
        method: "POST",
        headers: practiceHeaders(),
        body: JSON.stringify({
          question,
          documentId: selectedId,
          topK,
          minScore,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Query failed");
      setStatus(data.status);
      setAnswer(data.answer);
      setRetrieved(data.retrieved ?? []);
      setCitations(data.citations ?? []);
      setBestScore(
        typeof data.bestScore === "number" ? data.bestScore : null
      );
      setUsage(data.usage ?? null);
      setCacheHit(typeof data.cacheHit === "boolean" ? data.cacheHit : null);
      setCacheBackend(
        typeof data.cacheBackend === "string" ? data.cacheBackend : null
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ask failed");
    } finally {
      setAsking(false);
    }
  }

  async function runEval() {
    if (!selectedId || evaluating) return;
    setEvaluating(true);
    setError(null);
    setEvalRows([]);
    setEvalSummary(null);
    setNote(null);
    try {
      const res = await fetch("/api/rag/eval", {
        method: "POST",
        headers: practiceHeaders(),
        body: JSON.stringify({
          documentId: selectedId,
          topK,
          minScore,
          scoreTriad,
          limit: evalLimit,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Eval failed");
      setEvalRows(data.rows ?? []);
      setEvalSummary(data.summary ?? null);
      setNote(data.note ?? "Eval done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Eval failed");
    } finally {
      setEvaluating(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-zinc-500">
        Knowledge base: ingest PDFs, ask with citations, optional cache via Redis.
        Docker stack includes{" "}
        <a className="underline" href="/n8n">
          n8n workflows
        </a>{" "}
        (:5678) + Redis (:6379).
      </p>

      <div className="space-y-2 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-950">
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
          Ingest
        </p>
        <input
          type="file"
          accept="application/pdf"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="block w-full text-sm"
        />
        <label className="block text-xs text-zinc-600 dark:text-zinc-400">
          Chunk mode
          <select
            value={chunkMode}
            onChange={(e) => setChunkMode(e.target.value as ChunkMode)}
            className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900"
          >
            <option value="basic">Basic (fixed size)</option>
            <option value="sentence_window">Sentence-window</option>
            <option value="auto_merging">Auto-merging (parents + children)</option>
          </select>
        </label>

        {chunkMode === "basic" && (
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="text-xs text-zinc-600 dark:text-zinc-400">
              Chunk size (chars)
              <input
                type="number"
                min={200}
                max={2000}
                value={chunkSize}
                onChange={(e) => setChunkSize(Number(e.target.value))}
                className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900"
              />
            </label>
            <label className="text-xs text-zinc-600 dark:text-zinc-400">
              Overlap (chars)
              <input
                type="number"
                min={0}
                max={400}
                value={overlap}
                onChange={(e) => setOverlap(Number(e.target.value))}
                className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900"
              />
            </label>
          </div>
        )}

        {chunkMode === "sentence_window" && (
          <label className="block text-xs text-zinc-600 dark:text-zinc-400">
            Window size (sentences each side)
            <input
              type="number"
              min={0}
              max={10}
              value={windowSize}
              onChange={(e) => setWindowSize(Number(e.target.value))}
              className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900"
            />
          </label>
        )}

        {chunkMode === "auto_merging" && (
          <div className="grid gap-2 sm:grid-cols-3">
            <label className="text-xs text-zinc-600 dark:text-zinc-400">
              Parent size
              <input
                type="number"
                min={600}
                max={4000}
                value={parentSize}
                onChange={(e) => setParentSize(Number(e.target.value))}
                className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900"
              />
            </label>
            <label className="text-xs text-zinc-600 dark:text-zinc-400">
              Child size
              <input
                type="number"
                min={150}
                max={1000}
                value={childSize}
                onChange={(e) => setChildSize(Number(e.target.value))}
                className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900"
              />
            </label>
            <label className="text-xs text-zinc-600 dark:text-zinc-400">
              Merge threshold
              <input
                type="number"
                min={0.2}
                max={1}
                step={0.1}
                value={mergeThreshold}
                onChange={(e) => setMergeThreshold(Number(e.target.value))}
                className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900"
              />
              <span className="mt-1 block text-[11px] text-zinc-500">
                If ≥ this fraction of a parent’s children are retrieved → return
                parent.
              </span>
            </label>
          </div>
        )}

        <button
          type="button"
          onClick={ingest}
          disabled={loading || !file}
          className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {loading
            ? jobProgress || "Background job running…"
            : `Ingest PDF async (${chunkMode})`}
        </button>
        {jobProgress && !error && (
          <p className="text-xs text-amber-700 dark:text-amber-300">
            Job: {jobProgress}
          </p>
        )}
      </div>

      {docs.length > 0 && (
        <div className="space-y-2 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-950">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Ask
          </p>
          <textarea
            className="min-h-20 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Ask a question about your PDF…"
          />
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="text-xs text-zinc-600 dark:text-zinc-400">
              Top K
              <input
                type="number"
                min={1}
                max={10}
                value={topK}
                onChange={(e) => setTopK(Number(e.target.value))}
                className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900"
              />
            </label>
            <label className="text-xs text-zinc-600 dark:text-zinc-400">
              Min score
              <input
                type="number"
                min={0}
                max={1}
                step={0.05}
                value={minScore}
                onChange={(e) => setMinScore(Number(e.target.value))}
                className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900"
              />
            </label>
          </div>
          <p className="text-[11px] text-zinc-500">
            Selected:{" "}
            {selectedId && meta
              ? `${meta.filename} · ${modeLabel(meta)}`
              : selectedId
                ? selectedId
                : "all documents"}
          </p>
          <button
            type="button"
            onClick={ask}
            disabled={asking || !question.trim()}
            className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {asking ? "Retrieving + answering…" : "Ask"}
          </button>
        </div>
      )}

      {docs.length > 0 && (
        <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50/50 p-4 dark:border-amber-900 dark:bg-amber-950/20">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-200">
            Eval set · quality check
          </p>
          <p className="text-[11px] text-zinc-600 dark:text-zinc-400">
            Runs a fixed question list on the <strong>selected</strong> doc.
            Checks answer vs refuse, optional RAG triad scores (uses more Groq
            calls).
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="text-xs text-zinc-600 dark:text-zinc-400">
              Questions to run (max 15)
              <input
                type="number"
                min={3}
                max={15}
                value={evalLimit}
                onChange={(e) => setEvalLimit(Number(e.target.value))}
                className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900"
              />
            </label>
            <label className="flex items-end gap-2 pb-2 text-xs text-zinc-600 dark:text-zinc-400">
              <input
                type="checkbox"
                checked={scoreTriad}
                onChange={(e) => setScoreTriad(e.target.checked)}
              />
              Score RAG triad (slower)
            </label>
          </div>
          <button
            type="button"
            onClick={runEval}
            disabled={evaluating || !selectedId}
            className="rounded-md bg-amber-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {evaluating
              ? "Running eval (may take a few minutes)…"
              : selectedId
                ? "Run eval on selected doc"
                : "Select a document first"}
          </button>
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
      {note && <p className="text-sm text-emerald-700">{note}</p>}

      {evalSummary && (
        <div className="space-y-2 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-950">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Eval summary
          </p>
          <p className="text-sm">
            Passed {evalSummary.passed}/{evalSummary.total} · failed{" "}
            {evalSummary.failed} · avg best score {evalSummary.avgBestScore}
          </p>
          {(evalSummary.avgContextRelevance != null ||
            evalSummary.avgGroundedness != null ||
            evalSummary.avgAnswerRelevance != null) && (
            <p className="text-xs text-zinc-600 dark:text-zinc-400">
              Triad avg — context {evalSummary.avgContextRelevance} · grounded{" "}
              {evalSummary.avgGroundedness} · answer{" "}
              {evalSummary.avgAnswerRelevance}
            </p>
          )}
          <ul className="max-h-96 space-y-2 overflow-y-auto">
            {evalRows.map((r) => (
              <li
                key={r.id}
                className={`rounded-md border p-3 text-xs ${
                  r.pass
                    ? "border-emerald-200 bg-emerald-50/50 dark:border-emerald-900 dark:bg-emerald-950/20"
                    : "border-red-200 bg-red-50/50 dark:border-red-900 dark:bg-red-950/20"
                }`}
              >
                <p className="font-semibold">
                  {r.pass ? "PASS" : "FAIL"} · {r.id} · expect {r.expect} ·
                  status {r.status} · score {r.bestScore}
                  {r.mergedCount > 0 ? ` · merged ${r.mergedCount}` : ""}
                </p>
                <p className="mt-1 text-zinc-700 dark:text-zinc-300">
                  Q: {r.question}
                </p>
                <p className="mt-1 whitespace-pre-wrap text-zinc-600 dark:text-zinc-400">
                  A: {r.answer.slice(0, 280)}
                  {r.answer.length > 280 ? "…" : ""}
                </p>
                {r.triad && (
                  <p className="mt-1 text-zinc-500">
                    Triad C{r.triad.contextRelevance} / G{r.triad.groundedness}{" "}
                    / A{r.triad.answerRelevance}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {answer && (
        <div className="space-y-2 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-950">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Answer · status {status}
            {bestScore != null ? ` · best score ${bestScore}` : ""}
            {cacheHit === true
              ? ` · cache HIT (${cacheBackend ?? "memory"})`
              : cacheHit === false
                ? ` · cache MISS (${cacheBackend ?? "memory"})`
                : ""}
          </p>
          <pre className="whitespace-pre-wrap text-sm">{answer}</pre>
          {citations.length > 0 && (
            <div className="space-y-1 text-xs text-zinc-600 dark:text-zinc-400">
              <p className="font-semibold">Citations</p>
              {citations.map((c) => (
                <p key={c.chunkId}>
                  [{c.n}] {c.filename} chunk #{c.chunkIndex} (score {c.score}) —{" "}
                  {c.excerpt}
                  {c.excerpt.length >= 220 ? "…" : ""}
                </p>
              ))}
            </div>
          )}
          <UsageBadge usage={usage} />
        </div>
      )}

      {retrieved.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Retrieved
          </p>
          <ul className="max-h-80 space-y-2 overflow-y-auto">
            {retrieved.map((r) => (
              <li
                key={r.chunkId}
                className="rounded-md border border-zinc-200 bg-white p-3 text-xs dark:border-zinc-700 dark:bg-zinc-950"
              >
                <p className="mb-1 font-semibold text-emerald-800 dark:text-emerald-300">
                  {r.filename} · #{r.index} · score {r.score}
                  {r.mode === "sentence_window" ? " · window" : ""}
                  {r.mode === "auto_merging"
                    ? r.merged
                      ? " · MERGED PARENT"
                      : " · child"
                    : ""}
                </p>
                {r.matchedText &&
                  r.matchedText !== r.text &&
                  (r.mode === "sentence_window" || r.merged) && (
                    <p className="mb-2 rounded bg-amber-50 p-2 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                      <span className="font-semibold">Matched: </span>
                      {r.matchedText}
                    </p>
                  )}
                <pre className="whitespace-pre-wrap text-zinc-700 dark:text-zinc-300">
                  {r.text}
                </pre>
              </li>
            ))}
          </ul>
        </div>
      )}

      {docs.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Stored documents
          </p>
          <ul className="space-y-2">
            {docs.map((d) => (
              <li
                key={d.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-700"
              >
                <button
                  type="button"
                  className="text-left hover:underline"
                  onClick={() => loadChunks(d.id)}
                >
                  <span className="font-medium">{d.filename}</span>
                  <span className="ml-2 text-xs text-zinc-500">
                    {d.chunkCount} chunks · {modeLabel(d)}
                    {selectedId === d.id ? " · selected" : ""}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => removeDoc(d.id)}
                  className="text-xs text-red-600"
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {meta && (
        <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-xs dark:border-zinc-700 dark:bg-zinc-900">
          <p>
            <span className="font-semibold">{meta.filename}</span> ·{" "}
            {modeLabel(meta)}
            {meta.truncated ? " · truncated" : ""}
          </p>
        </div>
      )}

      {chunks.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Chunks ({chunks.length})
          </p>
          <ul className="max-h-96 space-y-2 overflow-y-auto">
            {chunks.map((c) => (
              <li
                key={c.id}
                className="rounded-md border border-zinc-200 bg-white p-3 text-xs dark:border-zinc-700 dark:bg-zinc-950"
              >
                <p className="mb-1 font-semibold text-emerald-800 dark:text-emerald-300">
                  #{c.index}
                  {typeof c.parentIndex === "number"
                    ? ` · parent #${c.parentIndex}`
                    : ""}{" "}
                  · chars {c.charStart}–{c.charEnd}
                </p>
                <pre className="whitespace-pre-wrap text-zinc-700 dark:text-zinc-300">
                  {c.text}
                </pre>
                {c.windowText && c.windowText !== c.text && (
                  <pre className="mt-2 whitespace-pre-wrap rounded bg-zinc-50 p-2 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400">
                    <span className="font-semibold">Window: </span>
                    {c.windowText}
                  </pre>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
