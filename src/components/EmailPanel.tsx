"use client";

import { useState } from "react";
import { practiceHeaders } from "@/lib/client-headers";
import type { EmailOutput } from "@/lib/schemas";
import type { UsageInfo } from "@/lib/usage";
import { UsageBadge } from "./UsageBadge";

export function EmailPanel() {
  const [purpose, setPurpose] = useState("");
  const [tone, setTone] = useState("professional");
  const [recipient, setRecipient] = useState("");
  const [keyPoints, setKeyPoints] = useState("");
  const [email, setEmail] = useState<EmailOutput | null>(null);
  const [usage, setUsage] = useState<UsageInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    if (loading) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/email", {
        method: "POST",
        headers: practiceHeaders(),
        body: JSON.stringify({ purpose, tone, recipient, keyPoints }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Request failed");

      setEmail(data.email);
      setUsage(data.usage);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Email failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block text-zinc-600 dark:text-zinc-400">
            Purpose
          </span>
          <input
            className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 outline-none focus:border-emerald-600 dark:border-zinc-600 dark:bg-zinc-900"
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
            placeholder="Follow up after a meeting"
            disabled={loading}
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-zinc-600 dark:text-zinc-400">
            Tone
          </span>
          <select
            className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 outline-none focus:border-emerald-600 dark:border-zinc-600 dark:bg-zinc-900"
            value={tone}
            onChange={(e) => setTone(e.target.value)}
            disabled={loading}
          >
            <option value="professional">Professional</option>
            <option value="friendly">Friendly</option>
            <option value="formal">Formal</option>
            <option value="persuasive">Persuasive</option>
          </select>
        </label>
        <label className="block text-sm sm:col-span-2">
          <span className="mb-1 block text-zinc-600 dark:text-zinc-400">
            Recipient
          </span>
          <input
            className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 outline-none focus:border-emerald-600 dark:border-zinc-600 dark:bg-zinc-900"
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
            placeholder="Hiring manager at Acme"
            disabled={loading}
          />
        </label>
        <label className="block text-sm sm:col-span-2">
          <span className="mb-1 block text-zinc-600 dark:text-zinc-400">
            Key points
          </span>
          <textarea
            className="min-h-28 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 outline-none focus:border-emerald-600 dark:border-zinc-600 dark:bg-zinc-900"
            value={keyPoints}
            onChange={(e) => setKeyPoints(e.target.value)}
            placeholder={"- Thank them for their time\n- Share next steps\n- Ask for a reply by Friday"}
            disabled={loading}
          />
        </label>
      </div>

      <button
        type="button"
        onClick={run}
        disabled={
          loading || !purpose.trim() || !recipient.trim() || !keyPoints.trim()
        }
        className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {loading ? "Writing…" : "Write email (JSON + Zod)"}
      </button>

      {email && (
        <div className="space-y-3 rounded-lg border border-zinc-200 bg-zinc-50 p-4 text-sm dark:border-zinc-700 dark:bg-zinc-900">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Subject
            </p>
            <p className="mt-1 font-medium">{email.subject}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Body
            </p>
            <p className="mt-1 whitespace-pre-wrap">{email.body}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              CTA
            </p>
            <p className="mt-1">{email.cta}</p>
          </div>
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
      <UsageBadge usage={usage} />
    </div>
  );
}
