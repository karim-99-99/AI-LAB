import { listRagDocuments } from "@/lib/rag/store";
import { retrieveChunks } from "@/lib/rag/retrieve";
import { logRun } from "@/lib/automation";
import { newId, updateStore } from "@/lib/store";
import type { AgentApprovalRef } from "@/lib/agent/types";

export async function toolListDocuments(): Promise<string> {
  const docs = await listRagDocuments();
  return JSON.stringify(
    docs.map((d) => ({
      id: d.id,
      filename: d.filename,
      chunkCount: d.chunkCount,
      mode: d.chunkMode ?? "basic",
    }))
  );
}

export async function toolSearchDocs(
  question: string,
  topK = 4
): Promise<string> {
  const q = question.trim();
  if (!q) return JSON.stringify({ error: "question required" });
  const { hits, bestScore } = await retrieveChunks(q, {
    topK: Number.isFinite(topK) ? Math.min(8, Math.max(1, topK)) : 4,
  });
  return JSON.stringify({
    bestScore: Number(bestScore.toFixed(4)),
    hits: hits.map((h) => ({
      filename: h.filename,
      index: h.index,
      score: Number(h.score.toFixed(4)),
      text: h.text.slice(0, 600),
    })),
  });
}

/** Queues draft for /approve — does not send. */
export async function toolDraftEmail(input: {
  to?: string | null;
  subject: string;
  body: string;
  threadId: string;
  approvals: AgentApprovalRef[];
}): Promise<string> {
  const to = String(input.to ?? "").trim() || null;
  const subject =
    String(input.subject ?? "Agent draft").trim() || "Agent draft";
  const body = String(input.body ?? "").trim();
  if (!body) return JSON.stringify({ error: "body required" });

  const approvalId = newId("appr");
  const run = await logRun({
    workflow: "agent_draft_email",
    status: "pending_approval",
    inputPreview: subject.slice(0, 120),
    resultPreview: body.slice(0, 120),
  });

  await updateStore((store) => {
    store.approvals.unshift({
      id: approvalId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      kind: "agent",
      status: "pending",
      title: subject,
      draft: {
        to: to ?? undefined,
        subject,
        body,
        channel: "email",
      },
        context: { threadId: input.threadId, source: "research_agent" },
      runId: run.id,
    });
  });

  input.approvals.push({
    approvalId,
    subject,
    to,
    approveUrl: "/approve",
  });

  return JSON.stringify({
    status: "pending_human_approval",
    approvalId,
    approveUrl: "/approve",
    to,
    subject,
    bodyPreview: body.slice(0, 280),
    note: "Queued for a human. Open /approve to Approve or Reject. Agent did not send.",
  });
}
