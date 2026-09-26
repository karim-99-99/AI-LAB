"use client";

import { useState } from "react";
import { practiceHeaders } from "@/lib/client-headers";
import type { ResumeOutput } from "@/lib/schemas";
import type { UsageInfo } from "@/lib/usage";
import { UsageBadge } from "./UsageBadge";

export function ResumePanel() {
  const [resume, setResume] = useState("");
  const [role, setRole] = useState("Full-stack AI engineer");
  const [analysis, setAnalysis] = useState<ResumeOutput | null>(null);
  const [usage, setUsage] = useState<UsageInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    if (!resume.trim() || loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/resume", {
        method: "POST",
        headers: practiceHeaders(),
        body: JSON.stringify({ resume, role }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Request failed");
      setAnalysis(data.analysis);
      setUsage(data.usage);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Resume analysis failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <input
        className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-600 dark:border-zinc-600 dark:bg-zinc-900"
        value={role}
        onChange={(e) => setRole(e.target.value)}
        placeholder="Target role"
      />
      <textarea
        className="min-h-48 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-600 dark:border-zinc-600 dark:bg-zinc-900"
        value={resume}
        onChange={(e) => setResume(e.target.value)}
        placeholder="Paste resume text…"
      />
      <button
        type="button"
        onClick={run}
        disabled={loading || !resume.trim()}
        className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {loading ? "Scoring…" : "Analyze resume"}
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {analysis && (
        <div className="space-y-2 rounded-lg border border-zinc-200 bg-white p-4 text-sm dark:border-zinc-700 dark:bg-zinc-950">
          <p>
            <span className="font-semibold">Score:</span> {analysis.overallScore}/100 ·{" "}
            <span className="font-semibold">{analysis.hireRecommendation}</span>
          </p>
          <p>{analysis.summary}</p>
          <div>
            <p className="font-semibold">Strengths</p>
            <ul className="list-disc pl-5">
              {analysis.strengths.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          </div>
          <div>
            <p className="font-semibold">Gaps</p>
            <ul className="list-disc pl-5">
              {analysis.gaps.map((g) => (
                <li key={g}>{g}</li>
              ))}
            </ul>
          </div>
        </div>
      )}
      <UsageBadge usage={usage} />
    </div>
  );
}
