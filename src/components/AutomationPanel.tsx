"use client";

import { useEffect, useState } from "react";
import { practiceHeaders } from "@/lib/client-headers";
import type { UsageInfo } from "@/lib/usage";
import { UsageBadge } from "./UsageBadge";

type Tab = "email" | "support" | "channel" | "crm" | "meeting";

export function AutomationPanel() {
  const [tab, setTab] = useState<Tab>("support");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<unknown>(null);
  const [usage, setUsage] = useState<UsageInfo | null>(null);
  const [runsPreview, setRunsPreview] = useState("");

  // email
  const [emailTo, setEmailTo] = useState("customer@example.com");
  const [emailPurpose, setEmailPurpose] = useState("Follow up on trial ending");
  const [emailContext, setEmailContext] = useState("User signed up 13 days ago.");
  const [emailApproval, setEmailApproval] = useState(false);

  // support
  const [ticket, setTicket] = useState(
    "Hi, my invoice PDF won't upload and I need help before Friday."
  );
  const [customer, setCustomer] = useState("sam@example.com");

  // channel
  const [channel, setChannel] = useState<"slack" | "whatsapp">("slack");
  const [channelUser, setChannelUser] = useState("alex");
  const [channelText, setChannelText] = useState("What are your support hours?");
  const [channelApproval, setChannelApproval] = useState(false);

  // crm
  const [crmText, setCrmText] = useState(
    "Lead: Dana Lee from Northwind Labs, dana@northwind.test, interested in AI automation consulting."
  );

  // meeting
  const [transcript, setTranscript] = useState(
    "Alex: We need the invoice extractor live by Friday.\nSam: I'll finish PDF upload tomorrow.\nDana: I'll write the n8n webhook docs."
  );
  const [notifyEmail, setNotifyEmail] = useState("team@example.com");

  async function refreshRuns() {
    try {
      const res = await fetch("/api/runs", { headers: practiceHeaders() });
      const data = await res.json();
      if (res.ok) {
        setRunsPreview(
          JSON.stringify(
            {
              runs: (data.runs ?? []).slice(0, 5),
              outbox: (data.outbox ?? []).slice(0, 3),
            },
            null,
            2
          )
        );
      }
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    void refreshRuns();
  }, []);

  async function run() {
    setLoading(true);
    setError(null);
    setResult(null);
    const idem = `ui-${tab}-${Date.now()}`;
    try {
      let url = "";
      let body: Record<string, unknown> = {};

      if (tab === "email") {
        url = "/api/automation/email";
        body = {
          to: emailTo,
          purpose: emailPurpose,
          context: emailContext,
          requireApproval: emailApproval,
        };
      } else if (tab === "support") {
        url = "/api/automation/support";
        body = { customer, ticket };
      } else if (tab === "channel") {
        url = "/api/automation/channel";
        body = {
          channel,
          user: channelUser,
          text: channelText,
          requireApproval: channelApproval,
        };
      } else if (tab === "crm") {
        url = "/api/automation/crm";
        body = { text: crmText, source: "ui" };
      } else {
        url = "/api/automation/meeting";
        body = { transcript, notifyEmail };
      }

      const res = await fetch(url, {
        method: "POST",
        headers: {
          ...practiceHeaders(),
          "Idempotency-Key": idem,
        },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Request failed");
      setResult(data);
      if (data.usage) setUsage(data.usage);
      await refreshRuns();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Automation failed");
    } finally {
      setLoading(false);
    }
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: "support", label: "Support + approve" },
    { id: "email", label: "Email" },
    { id: "channel", label: "Slack/WA sim" },
    { id: "crm", label: "CRM" },
    { id: "meeting", label: "Meeting" },
  ];

  return (
    <div className="space-y-4">
      <p className="text-xs text-zinc-500">
        Webhooks call your AI API. Open{" "}
        <a className="underline" href="/approve">
          Approvals
        </a>{" "}
        for human-in-the-loop. Same routes are used by{" "}
        <a className="underline" href="/n8n">
          n8n workflows
        </a>
        .
      </p>
      <div className="flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`rounded-md px-3 py-1.5 text-xs font-medium ${
              tab === t.id
                ? "bg-emerald-700 text-white"
                : "bg-zinc-100 dark:bg-zinc-800"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "email" && (
        <div className="space-y-2">
          <input
            className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900"
            value={emailTo}
            onChange={(e) => setEmailTo(e.target.value)}
            placeholder="To"
          />
          <input
            className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900"
            value={emailPurpose}
            onChange={(e) => setEmailPurpose(e.target.value)}
            placeholder="Purpose"
          />
          <textarea
            className="min-h-20 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900"
            value={emailContext}
            onChange={(e) => setEmailContext(e.target.value)}
          />
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={emailApproval}
              onChange={(e) => setEmailApproval(e.target.checked)}
            />
            Require human approval
          </label>
        </div>
      )}

      {tab === "support" && (
        <div className="space-y-2">
          <input
            className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900"
            value={customer}
            onChange={(e) => setCustomer(e.target.value)}
            placeholder="Customer email"
          />
          <textarea
            className="min-h-24 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900"
            value={ticket}
            onChange={(e) => setTicket(e.target.value)}
          />
        </div>
      )}

      {tab === "channel" && (
        <div className="space-y-2">
          <select
            value={channel}
            onChange={(e) => setChannel(e.target.value as "slack" | "whatsapp")}
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900"
          >
            <option value="slack">Slack</option>
            <option value="whatsapp">WhatsApp</option>
          </select>
          <input
            className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900"
            value={channelUser}
            onChange={(e) => setChannelUser(e.target.value)}
            placeholder="User"
          />
          <textarea
            className="min-h-20 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900"
            value={channelText}
            onChange={(e) => setChannelText(e.target.value)}
          />
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={channelApproval}
              onChange={(e) => setChannelApproval(e.target.checked)}
            />
            Require approval before reply
          </label>
        </div>
      )}

      {tab === "crm" && (
        <textarea
          className="min-h-28 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900"
          value={crmText}
          onChange={(e) => setCrmText(e.target.value)}
        />
      )}

      {tab === "meeting" && (
        <div className="space-y-2">
          <textarea
            className="min-h-28 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900"
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
          />
          <input
            className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900"
            value={notifyEmail}
            onChange={(e) => setNotifyEmail(e.target.value)}
            placeholder="Notify email (local outbox)"
          />
        </div>
      )}

      <button
        type="button"
        onClick={run}
        disabled={loading}
        className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {loading ? "Running…" : "Trigger workflow"}
      </button>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {result != null && (
        <pre className="max-h-64 overflow-auto rounded-lg border border-zinc-200 bg-white p-3 text-xs dark:border-zinc-700 dark:bg-zinc-950">
          {JSON.stringify(result, null, 2)}
        </pre>
      )}
      {runsPreview && (
        <div>
          <p className="mb-1 text-xs font-semibold">Recent runs / outbox</p>
          <pre className="max-h-48 overflow-auto rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-xs dark:border-zinc-700 dark:bg-zinc-900">
            {runsPreview}
          </pre>
        </div>
      )}
      <UsageBadge usage={usage} />
    </div>
  );
}
