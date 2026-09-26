"use client";

import { useCallback, useEffect, useState } from "react";
import { practiceHeaders } from "@/lib/client-headers";

type Approval = {
  id: string;
  createdAt: string;
  kind: string;
  status: string;
  title: string;
  draft: {
    to?: string;
    subject?: string;
    body: string;
    channel?: string;
  };
};

type DraftEdit = {
  to: string;
  subject: string;
  body: string;
  channel: string;
};

function toEdit(draft: Approval["draft"]): DraftEdit {
  return {
    to: draft.to ?? "",
    subject: draft.subject ?? "",
    body: draft.body ?? "",
    channel: draft.channel ?? "email",
  };
}

export default function ApprovePage() {
  const [items, setItems] = useState<Approval[]>([]);
  const [edits, setEdits] = useState<Record<string, DraftEdit>>({});
  const [error, setError] = useState<string | null>(null);
  const [lastNote, setLastNote] = useState<string | null>(null);
  const [gmailConfigured, setGmailConfigured] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/automation/approve", {
        headers: practiceHeaders(),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load");
      const pending = (data.pending ?? []) as Approval[];
      setItems(pending);
      setEdits((prev) => {
        const next: Record<string, DraftEdit> = {};
        for (const item of pending) {
          // Keep unsaved local edits if same id still pending
          next[item.id] = prev[item.id] ?? toEdit(item.draft);
        }
        return next;
      });
      setGmailConfigured(Boolean(data.gmailConfigured));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Load failed");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function patchEdit(id: string, field: keyof DraftEdit, value: string) {
    setEdits((prev) => ({
      ...prev,
      [id]: { ...(prev[id] ?? { to: "", subject: "", body: "", channel: "email" }), [field]: value },
    }));
  }

  async function act(id: string, action: "approve" | "reject" | "save") {
    const draft = edits[id];
    if (!draft) return;
    setBusyId(id);
    setLastNote(null);
    setError(null);
    try {
      const res = await fetch("/api/automation/approve", {
        method: "POST",
        headers: practiceHeaders(),
        body: JSON.stringify({
          id,
          action,
          draft: {
            to: draft.to,
            subject: draft.subject,
            body: draft.body,
            channel: draft.channel,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Action failed");
      if (data.note) setLastNote(data.note);
      if (action === "save" && data.draft) {
        setEdits((prev) => ({ ...prev, [id]: toEdit(data.draft) }));
        setItems((prev) =>
          prev.map((item) =>
            item.id === id
              ? {
                  ...item,
                  draft: data.draft,
                  title: data.draft.subject ?? item.title,
                }
              : item
          )
        );
      } else {
        await load();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-8 md:py-12">
      <header className="lab-animate-in space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--lab-accent)]">
          Human-in-the-loop
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">Approval queue</h1>
        <p className="text-sm text-[var(--lab-ink-muted)]">
          Review AI drafts: edit To / Subject / Body, then Save, Approve, or
          Reject.{" "}
          {gmailConfigured ? (
            <span className="font-medium text-[var(--lab-accent)]">
              Gmail is configured — Approve sends a real email.
            </span>
          ) : (
            <span>
              Gmail not configured yet — Approve saves to local outbox only.
            </span>
          )}{" "}
          <a className="underline" href="/">
            Studio
          </a>
          {" · "}
          <a className="underline" href="/n8n">
            n8n workflows
          </a>
        </p>
      </header>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {lastNote && <p className="text-sm text-emerald-700">{lastNote}</p>}

      {items.length === 0 ? (
        <p className="text-sm text-zinc-500">
          No pending approvals. Run the Agent tab with a goal that drafts an
          email, or trigger support from n8n / Automation.
        </p>
      ) : (
        <ul className="space-y-4">
          {items.map((item) => {
            const draft = edits[item.id] ?? toEdit(item.draft);
            const busy = busyId === item.id;
            return (
              <li
                key={item.id}
                className="space-y-3 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-950"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs uppercase tracking-wide text-zinc-500">
                    {item.kind} · {item.createdAt.slice(0, 19)} · {item.id}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => act(item.id, "save")}
                      className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-600 disabled:opacity-50"
                    >
                      Save edits
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => act(item.id, "approve")}
                      className="rounded-md bg-emerald-700 px-3 py-1.5 text-sm text-white disabled:opacity-50"
                    >
                      {gmailConfigured ? "Approve → Gmail" : "Approve → outbox"}
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => act(item.id, "reject")}
                      className="rounded-md bg-zinc-800 px-3 py-1.5 text-sm text-white disabled:opacity-50"
                    >
                      Reject
                    </button>
                  </div>
                </div>

                <label className="block space-y-1 text-xs text-zinc-600 dark:text-zinc-400">
                  To
                  <input
                    className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900"
                    value={draft.to}
                    onChange={(e) => patchEdit(item.id, "to", e.target.value)}
                    placeholder="you@gmail.com"
                    disabled={busy}
                  />
                </label>

                <label className="block space-y-1 text-xs text-zinc-600 dark:text-zinc-400">
                  Subject
                  <input
                    className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900"
                    value={draft.subject}
                    onChange={(e) =>
                      patchEdit(item.id, "subject", e.target.value)
                    }
                    disabled={busy}
                  />
                </label>

                <label className="block space-y-1 text-xs text-zinc-600 dark:text-zinc-400">
                  Channel
                  <select
                    className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900"
                    value={draft.channel}
                    onChange={(e) =>
                      patchEdit(item.id, "channel", e.target.value)
                    }
                    disabled={busy}
                  >
                    <option value="email">email</option>
                    <option value="slack">slack</option>
                    <option value="whatsapp">whatsapp</option>
                  </select>
                </label>

                <label className="block space-y-1 text-xs text-zinc-600 dark:text-zinc-400">
                  Body — edit freely (add / remove / rewrite)
                  <textarea
                    className="min-h-40 w-full rounded-md border border-zinc-300 px-3 py-2 font-mono text-xs dark:border-zinc-600 dark:bg-zinc-900"
                    value={draft.body}
                    onChange={(e) => patchEdit(item.id, "body", e.target.value)}
                    disabled={busy}
                  />
                </label>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
