import { NextResponse } from "next/server";
import { getOpenAI } from "@/lib/openai";
import { getModelForTask } from "@/lib/model-router";
import { guardRequest } from "@/lib/guard";
import {
  getIdempotentResponse,
  logRun,
  readIdempotencyKey,
  saveIdempotentResponse,
} from "@/lib/automation";
import { supportDraftSchema } from "@/lib/schemas";
import { newId, updateStore } from "@/lib/store";
import { buildAndLogUsage } from "@/lib/usage-server";

export async function POST(request: Request) {
  const blocked = guardRequest(request);
  if (blocked) return blocked;

  const idemKey = readIdempotencyKey(request);
  const cached = await getIdempotentResponse(idemKey);
  if (cached) return NextResponse.json(cached);

  try {
    const body = await request.json();
    const customer = String(body.customer ?? body.to ?? "customer").trim();
    const ticket = String(body.ticket ?? body.message ?? "").trim();

    if (!ticket) {
      return NextResponse.json({ error: "ticket is required" }, { status: 400 });
    }

    const model = getModelForTask("automation_support");
    const completion = await getOpenAI().chat.completions.create({
      model,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `Draft a customer support reply. ONLY JSON:
{"subject":"...","body":"...","tone":"empathetic"}
Be helpful; do not invent refunds/policy exceptions.`,
        },
        {
          role: "user",
          content: `Customer: ${customer}\nTicket:\n${ticket}`,
        },
      ],
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw);
    const validated = supportDraftSchema.safeParse(parsed);
    if (!validated.success) {
      await logRun({
        workflow: "support",
        status: "error",
        error: "Zod validation failed",
        idempotencyKey: idemKey ?? undefined,
      });
      return NextResponse.json(
        { error: "JSON failed Zod validation", details: validated.error.flatten() },
        { status: 502 }
      );
    }

    const usage = buildAndLogUsage(model, completion.usage, { route: "/api/automation/support" });
    const approvalId = newId("appr");
    const run = await logRun({
      workflow: "support",
      status: "pending_approval",
      tokens: usage.totalTokens,
      inputPreview: ticket.slice(0, 120),
      resultPreview: validated.data.subject,
      idempotencyKey: idemKey ?? undefined,
    });

    await updateStore((store) => {
      store.approvals.unshift({
        id: approvalId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        kind: "support",
        status: "pending",
        title: validated.data.subject,
        draft: {
          to: customer,
          subject: validated.data.subject,
          body: validated.data.body,
          channel: "email",
        },
        context: { ticket },
        runId: run.id,
      });
    });

    const response = {
      status: "pending_approval",
      approvalId,
      draft: validated.data,
      usage,
      approveUrl: "/approve",
      note: "Human must approve before send. Review and edit at /approve.",
    };
    await saveIdempotentResponse(idemKey, response);
    return NextResponse.json(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Support flow failed";
    await logRun({
      workflow: "support",
      status: "error",
      error: message,
      idempotencyKey: idemKey ?? undefined,
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
