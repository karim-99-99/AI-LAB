"use client";

import { useEffect, useState } from "react";
import { practiceHeaders } from "@/lib/client-headers";
import type { UsageInfo } from "@/lib/usage";
import { UsageBadge } from "./UsageBadge";

type AgentStep = {
  n: number;
  type: string;
  name?: string;
  detail: string;
};

type MemoryTurn = {
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  toolsUsed?: string[];
};

type ApprovalRef = {
  approvalId: string;
  subject: string;
  to: string | null;
  approveUrl: string;
};

type EngineInfo = {
  engine: string;
  title: string;
  loop: string;
  memory: string;
  graph: string;
  whenItMatters: string;
  extras?: Record<string, string | number | boolean>;
};

function freshThreadId() {
  return `thread_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function AgentPanel() {
  const [goal, setGoal] = useState(
    "Search our docs for the main topic, then draft a short email to practice@example.com summarizing it for a teammate."
  );
  const [threadId, setThreadId] = useState(freshThreadId);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [answer, setAnswer] = useState<string | null>(null);
  const [steps, setSteps] = useState<AgentStep[]>([]);
  const [model, setModel] = useState<string | null>(null);
  const [usage, setUsage] = useState<UsageInfo | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [memoryTurns, setMemoryTurns] = useState(0);
  const [history, setHistory] = useState<MemoryTurn[]>([]);
  const [approvals, setApprovals] = useState<ApprovalRef[]>([]);
  const [engine, setEngine] = useState<"langgraph" | "manual">("langgraph");
  const [usedEngine, setUsedEngine] = useState<string | null>(null);
  const [engineInfo, setEngineInfo] = useState<EngineInfo | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadThread() {
      try {
        const res = await fetch(
          `/api/agent/run?threadId=${encodeURIComponent(threadId)}`,
          { headers: practiceHeaders() }
        );
        if (!res.ok) {
          if (!cancelled) setHistory([]);
          return;
        }
        const data = await res.json();
        if (!cancelled) setHistory(data.thread?.turns ?? []);
      } catch {
        if (!cancelled) setHistory([]);
      }
    }
    void loadThread();
    return () => {
      cancelled = true;
    };
  }, [threadId]);

  function newThread() {
    setThreadId(freshThreadId());
    setAnswer(null);
    setSteps([]);
    setUsage(null);
    setNote(null);
    setError(null);
    setMemoryTurns(0);
    setHistory([]);
    setApprovals([]);
    setUsedEngine(null);
    setEngineInfo(null);
    setGoal(
      "Search our docs for the main topic, then draft a short email to practice@example.com summarizing it."
    );
  }

  async function run() {
    if (!goal.trim() || loading) return;
    setLoading(true);
    setError(null);
    setAnswer(null);
    setSteps([]);
    setUsage(null);
    setNote(null);
    setApprovals([]);
    setUsedEngine(null);
    setEngineInfo(null);
    try {
      const res = await fetch("/api/agent/run", {
        method: "POST",
        headers: practiceHeaders(),
        body: JSON.stringify({ goal, maxSteps: 6, threadId, engine }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Agent failed");
      setAnswer(data.answer);
      setSteps(data.steps ?? []);
      setModel(data.model ?? null);
      setUsage(data.usage ?? null);
      setNote(data.note ?? null);
      setMemoryTurns(Number(data.memoryTurns ?? 0));
      if (data.threadId) setThreadId(data.threadId);
      setHistory(data.thread?.turns ?? []);
      setApprovals(data.approvals ?? []);
      setUsedEngine(data.engine ?? engine);
      setEngineInfo(data.engineInfo ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Agent failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-zinc-500">
        Same tools + same answer style on purpose. The difference is{" "}
        <strong>how the loop is built</strong> (see “How this engine ran” after
        each run). Switch engines and compare that box — not the final answer.
      </p>

      <div className="flex flex-wrap items-end gap-2">
        <label className="space-y-1 text-xs text-zinc-600 dark:text-zinc-400">
          Engine
          <select
            className="block rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900"
            value={engine}
            onChange={(e) =>
              setEngine(e.target.value === "manual" ? "manual" : "langgraph")
            }
          >
            <option value="langgraph">LangGraph (npm)</option>
            <option value="manual">Manual ReAct</option>
          </select>
        </label>
        <label className="min-w-[16rem] flex-1 space-y-1 text-xs text-zinc-600 dark:text-zinc-400">
          Thread ID
          <input
            className="w-full rounded-md border border-zinc-300 px-3 py-2 font-mono text-xs dark:border-zinc-600 dark:bg-zinc-900"
            value={threadId}
            onChange={(e) => setThreadId(e.target.value.trim())}
            spellCheck={false}
          />
        </label>
        <button
          type="button"
          onClick={newThread}
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600"
        >
          New thread
        </button>
      </div>

      <textarea
        className="min-h-28 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900"
        value={goal}
        onChange={(e) => setGoal(e.target.value)}
        placeholder="Agent goal…"
      />

      <button
        type="button"
        onClick={run}
        disabled={loading || !goal.trim()}
        className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {loading ? "Agent running…" : "Run agent"}
      </button>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {note && <p className="text-sm text-emerald-700">{note}</p>}

      {engineInfo && (
        <div
          className={
            engineInfo.engine === "langgraph"
              ? "space-y-2 rounded-lg border border-sky-300 bg-sky-50 p-4 text-sm dark:border-sky-700 dark:bg-sky-950/40"
              : "space-y-2 rounded-lg border border-violet-300 bg-violet-50 p-4 text-sm dark:border-violet-700 dark:bg-violet-950/40"
          }
        >
          <p className="text-xs font-semibold uppercase tracking-wide">
            How this engine ran · {engineInfo.title}
          </p>
          <ul className="space-y-1.5 text-xs text-zinc-700 dark:text-zinc-300">
            <li>
              <span className="font-semibold">Loop:</span> {engineInfo.loop}
            </li>
            <li>
              <span className="font-semibold">Memory:</span> {engineInfo.memory}
            </li>
            <li>
              <span className="font-semibold">Graph:</span> {engineInfo.graph}
            </li>
            <li>
              <span className="font-semibold">When it matters:</span>{" "}
              {engineInfo.whenItMatters}
            </li>
          </ul>
          {engineInfo.extras && (
            <pre className="overflow-x-auto rounded-md bg-white/70 p-2 font-mono text-[10px] dark:bg-zinc-900/70">
              {JSON.stringify(engineInfo.extras, null, 2)}
            </pre>
          )}
        </div>
      )}

      {memoryTurns > 0 && (
        <p className="text-xs text-zinc-500">
          JSON thread has {memoryTurns} prior turn(s) (UI / manual inject).
        </p>
      )}

      {approvals.length > 0 && (
        <div className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-4 dark:border-amber-700 dark:bg-amber-950/40">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-200">
            Waiting for human ({approvals.length})
          </p>
          <ul className="space-y-2 text-sm">
            {approvals.map((a) => (
              <li key={a.approvalId}>
                <span className="font-medium">{a.subject}</span>
                {a.to ? ` → ${a.to}` : " → (no to)"}
                <span className="ml-2 font-mono text-xs text-zinc-500">
                  {a.approvalId}
                </span>
              </li>
            ))}
          </ul>
          <a
            href="/approve"
            className="inline-block rounded-md bg-amber-700 px-3 py-1.5 text-sm text-white"
          >
            Open approval queue
          </a>
        </div>
      )}

      {answer && (
        <div className="space-y-2 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-950">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Final answer
            {usedEngine ? ` · ${usedEngine}` : ""}
            {model ? ` · ${model}` : ""}
          </p>
          <pre className="whitespace-pre-wrap text-sm">{answer}</pre>
          <UsageBadge usage={usage} />
        </div>
      )}

      {history.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Thread memory ({history.length} turns)
          </p>
          <ul className="max-h-48 space-y-2 overflow-y-auto">
            {history.map((t, i) => (
              <li
                key={`${t.createdAt}-${i}`}
                className="rounded-md border border-zinc-200 bg-zinc-50 p-2 text-xs dark:border-zinc-700 dark:bg-zinc-900"
              >
                <p className="mb-1 font-semibold text-zinc-600 dark:text-zinc-300">
                  {t.role}
                  {t.toolsUsed?.length
                    ? ` · tools: ${t.toolsUsed.join(", ")}`
                    : ""}
                </p>
                <pre className="whitespace-pre-wrap text-zinc-700 dark:text-zinc-400">
                  {t.content.slice(0, 400)}
                  {t.content.length > 400 ? "…" : ""}
                </pre>
              </li>
            ))}
          </ul>
        </div>
      )}

      {steps.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Visible steps (this run)
          </p>
          <ul className="max-h-96 space-y-2 overflow-y-auto">
            {steps.map((s) => (
              <li
                key={`${s.n}-${s.type}-${s.name ?? ""}`}
                className="rounded-md border border-zinc-200 bg-white p-3 text-xs dark:border-zinc-700 dark:bg-zinc-950"
              >
                <p className="mb-1 font-semibold text-emerald-800 dark:text-emerald-300">
                  #{s.n} · {s.type}
                  {s.name ? ` · ${s.name}` : ""}
                </p>
                <pre className="whitespace-pre-wrap text-zinc-700 dark:text-zinc-300">
                  {s.detail}
                </pre>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
