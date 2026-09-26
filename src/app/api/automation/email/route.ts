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
import { emailOutputSchema } from "@/lib/schemas";
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
    const to = String(body.to ?? "").trim();
    const purpose = String(body.purpose ?? body.subject ?? "").trim();
    const context = String(body.context ?? body.body ?? "").trim();
    const requireApproval = Boolean(body.requireApproval);

    if (!to || !purpose) {
      return NextResponse.json(
        { error: "to and purpose are required" },
        { status: 400 }
      );
    }

    const model = getModelForTask("automation_email");
    const completion = await getOpenAI().chat.completions.create({
      model,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `Write an automation email. ONLY JSON:
{"subject":"...","body":"...","cta":"..."}`,
        },
        {
          role: "user",
          content: `To: ${to}\nPurpose: ${purpose}\nContext:\n${context}`,
        },
      ],
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw);
    const validated = emailOutputSchema.safeParse(parsed);
    if (!validated.success) {
      await logRun({
        workflow: "email",
        status: "error",
        error: "Zod validation failed",
        idempotencyKey: idemKey ?? undefined,
      });
      return NextResponse.json(
        { error: "JSON failed Zod validation", details: validated.error.flatten() },
        { status: 502 }
      );
    }

    const usage = buildAndLogUsage(model, completion.usage, { route: "/api/automation/email" });

    if (requireApproval) {
      const approvalId = newId("appr");
      const run = await logRun({
        workflow: "email",
        status: "pending_approval",
        tokens: usage.totalTokens,
        inputPreview: purpose.slice(0, 120),
        resultPreview: validated.data.subject,
        idempotencyKey: idemKey ?? undefined,
      });

      await updateStore((store) => {
        store.approvals.unshift({
          id: approvalId,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          kind: "email",
          status: "pending",
          title: validated.data.subject,
          draft: {
            to,
            subject: validated.data.subject,
            body: `${validated.data.body}\n\n${validated.data.cta}`,
            channel: "email",
          },
          context: { purpose },
          runId: run.id,
        });
      });

      const response = {
        status: "pending_approval",
        approvalId,
        draft: validated.data,
        usage,
        approveUrl: "/approve",
      };
      await saveIdempotentResponse(idemKey, response);
      return NextResponse.json(response);
    }

    const outboxId = newId("out");
    await updateStore((store) => {
      store.outbox.unshift({
        id: outboxId,
        createdAt: new Date().toISOString(),
        channel: "email",
        to,
        subject: validated.data.subject,
        body: `${validated.data.body}\n\n${validated.data.cta}`,
        status: "sent",
        meta: { purpose },
      });
    });

    const run = await logRun({
      workflow: "email",
      status: "ok",
      tokens: usage.totalTokens,
      inputPreview: purpose.slice(0, 120),
      resultPreview: outboxId,
      idempotencyKey: idemKey ?? undefined,
    });

    const response = {
      status: "sent",
      outboxId,
      runId: run.id,
      email: validated.data,
      usage,
    };
    await saveIdempotentResponse(idemKey, response);
    return NextResponse.json(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Email automation failed";
    await logRun({
      workflow: "email",
      status: "error",
      error: message,
      idempotencyKey: idemKey ?? undefined,
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
