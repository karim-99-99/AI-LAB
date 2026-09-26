import { NextResponse } from "next/server";
import { guardRequest } from "@/lib/guard";
import { logRun } from "@/lib/automation";
import { isGmailConfigured, sendGmail } from "@/lib/mail";
import { newId, readStore, updateStore } from "@/lib/store";

type DraftPatch = {
  to?: string;
  subject?: string;
  body?: string;
  channel?: string;
};

function applyDraftPatch(
  draft: {
    to?: string;
    subject?: string;
    body: string;
    channel?: string;
  },
  patch: DraftPatch | null | undefined
) {
  if (!patch || typeof patch !== "object") return draft;
  if (typeof patch.to === "string") draft.to = patch.to.trim() || undefined;
  if (typeof patch.subject === "string") {
    draft.subject = patch.subject.trim() || undefined;
  }
  if (typeof patch.body === "string") draft.body = patch.body;
  if (typeof patch.channel === "string") {
    const ch = patch.channel.trim();
    draft.channel = ch || undefined;
  }
  return draft;
}

export async function GET(request: Request) {
  const blocked = guardRequest(request);
  if (blocked) return blocked;

  const store = await readStore();
  const pending = store.approvals.filter((a) => a.status === "pending");
  return NextResponse.json({
    pending,
    all: store.approvals.slice(0, 50),
    gmailConfigured: isGmailConfigured(),
  });
}

export async function POST(request: Request) {
  const blocked = guardRequest(request);
  if (blocked) return blocked;

  try {
    const body = await request.json();
    const id = String(body.id ?? "").trim();
    const actionRaw = String(body.action ?? "approve").trim();
    const action =
      actionRaw === "reject"
        ? "reject"
        : actionRaw === "save"
          ? "save"
          : "approve";
    const draftPatch =
      body.draft && typeof body.draft === "object"
        ? (body.draft as DraftPatch)
        : null;

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const store = await readStore();
    const item = store.approvals.find((a) => a.id === id);
    if (!item) {
      return NextResponse.json({ error: "Approval not found" }, { status: 404 });
    }
    if (item.status !== "pending") {
      return NextResponse.json(
        { error: `Already ${item.status}` },
        { status: 409 }
      );
    }

    if (action === "save") {
      await updateStore((s) => {
        const row = s.approvals.find((a) => a.id === id);
        if (!row) return;
        applyDraftPatch(row.draft, draftPatch);
        if (row.draft.subject) row.title = row.draft.subject;
        row.updatedAt = new Date().toISOString();
      });
      const refreshed = (await readStore()).approvals.find((a) => a.id === id);
      return NextResponse.json({
        status: "saved",
        id,
        draft: refreshed?.draft,
        note: "Draft updated. Still pending — Approve or Reject when ready.",
      });
    }

    if (action === "reject") {
      await updateStore((s) => {
        const row = s.approvals.find((a) => a.id === id);
        if (row) {
          applyDraftPatch(row.draft, draftPatch);
          row.status = "rejected";
          row.updatedAt = new Date().toISOString();
        }
      });
      await logRun({
        workflow: "approve",
        status: "ok",
        resultPreview: `rejected:${id}`,
      });
      return NextResponse.json({ status: "rejected", id });
    }

    // approve: apply human edits first, then send/outbox
    await updateStore((s) => {
      const row = s.approvals.find((a) => a.id === id);
      if (!row) return;
      applyDraftPatch(row.draft, draftPatch);
      if (row.draft.subject) row.title = row.draft.subject;
      row.updatedAt = new Date().toISOString();
    });

    const latest = (await readStore()).approvals.find((a) => a.id === id);
    if (!latest) {
      return NextResponse.json({ error: "Approval not found" }, { status: 404 });
    }

    const to = (latest.draft.to ?? "").trim();
    const subject = latest.draft.subject ?? "Support reply";
    const text = latest.draft.body;
    const wantsEmail =
      !latest.draft.channel ||
      latest.draft.channel === "email" ||
      latest.kind === "support" ||
      latest.kind === "email" ||
      latest.kind === "agent";

    let gmail: { messageId: string; from: string } | null = null;
    let delivery: "gmail" | "local_outbox" = "local_outbox";

    if (wantsEmail && isGmailConfigured()) {
      if (!to || !to.includes("@")) {
        return NextResponse.json(
          {
            error:
              "Draft has no valid email in 'to'. Edit the To field, then Approve again.",
          },
          { status: 400 }
        );
      }
      gmail = await sendGmail({ to, subject, body: text });
      delivery = "gmail";
    }

    const outboxId = newId("out");
    await updateStore((s) => {
      const row = s.approvals.find((a) => a.id === id);
      if (!row) return;
      row.status = "approved";
      row.updatedAt = new Date().toISOString();
      s.outbox.unshift({
        id: outboxId,
        createdAt: new Date().toISOString(),
        channel:
          row.draft.channel === "slack" || row.draft.channel === "whatsapp"
            ? (row.draft.channel as "slack" | "whatsapp")
            : "email",
        to: row.draft.to ?? "unknown",
        subject: row.draft.subject,
        body: row.draft.body,
        status: "sent",
        meta: {
          approvalId: id,
          kind: row.kind,
          delivery,
          gmailMessageId: gmail?.messageId,
          gmailFrom: gmail?.from,
          humanEdited: Boolean(draftPatch),
        },
      });
    });

    await logRun({
      workflow: "approve",
      status: "ok",
      resultPreview: `approved:${id}->${outboxId}:${delivery}`,
    });

    return NextResponse.json({
      status: "approved",
      id,
      outboxId,
      delivery,
      gmail,
      note:
        delivery === "gmail"
          ? `Real email sent to ${to}`
          : "Saved to local outbox only. Set GMAIL_USER + GMAIL_APP_PASSWORD to send for real.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Approve failed";
    console.error("[/api/automation/approve]", message);
    await logRun({
      workflow: "approve",
      status: "error",
      error: message,
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
