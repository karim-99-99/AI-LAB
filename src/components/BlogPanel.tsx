"use client";

import { useState } from "react";
import { practiceHeaders } from "@/lib/client-headers";
import type { BlogOutput } from "@/lib/schemas";
import type { UsageInfo } from "@/lib/usage";
import { UsageBadge } from "./UsageBadge";

export function BlogPanel() {
  const [topic, setTopic] = useState("");
  const [audience, setAudience] = useState("developers learning AI automation");
  const [tone, setTone] = useState("practical");
  const [blog, setBlog] = useState<BlogOutput | null>(null);
  const [usage, setUsage] = useState<UsageInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    if (!topic.trim() || loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/blog", {
        method: "POST",
        headers: practiceHeaders(),
        body: JSON.stringify({ topic, audience, tone }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Request failed");
      setBlog(data.blog);
      setUsage(data.usage);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Blog failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <input
        className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-600 dark:border-zinc-600 dark:bg-zinc-900"
        value={topic}
        onChange={(e) => setTopic(e.target.value)}
        placeholder="Blog topic"
      />
      <div className="grid gap-2 sm:grid-cols-2">
        <input
          className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-600 dark:border-zinc-600 dark:bg-zinc-900"
          value={audience}
          onChange={(e) => setAudience(e.target.value)}
          placeholder="Audience"
        />
        <input
          className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-600 dark:border-zinc-600 dark:bg-zinc-900"
          value={tone}
          onChange={(e) => setTone(e.target.value)}
          placeholder="Tone"
        />
      </div>
      <button
        type="button"
        onClick={run}
        disabled={loading || !topic.trim()}
        className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {loading ? "Generating…" : "Generate blog"}
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {blog && (
        <div className="space-y-3 rounded-lg border border-zinc-200 bg-white p-4 text-sm dark:border-zinc-700 dark:bg-zinc-950">
          <h3 className="text-lg font-semibold">{blog.title}</h3>
          <div>
            <p className="font-semibold">Outline</p>
            <ol className="list-decimal pl-5">
              {blog.outline.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ol>
          </div>
          <pre className="max-h-96 overflow-y-auto whitespace-pre-wrap rounded-md bg-zinc-50 p-3 text-xs dark:bg-zinc-900">
            {blog.draft}
          </pre>
        </div>
      )}
      <UsageBadge usage={usage} />
    </div>
  );
}
