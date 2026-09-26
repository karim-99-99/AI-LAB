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
    const channel = body.channel === "whatsapp" ? "whatsapp" : "slack";
    const user = String(body.user ?? "user").trim();
    const text = String(body.text ?? body.message ?? "").trim();
    const requireApproval = Boolean(body.requireApproval);

    if (!text) {
      return NextResponse.json({ error: "text is required" }, { status: 400 });
    }

    const model = getModelForTask("automation_channel");
    const completion = await getOpenAI().chat.completions.create({
      model,
      messages: [
        {
          role: "system",
          content:
            "You are a concise Slack/WhatsApp assistant for a small business. Reply in plain text under 500 characters.",
        },
        { role: "user", content: text },
      ],
    });

    const reply = completion.choices[0]?.message?.content ?? "";
    const usage = buildAndLogUsage(model, completion.usage, { route: "/api/automation/channel" });

    const msgId = newId("chan");
    await updateStore((store) => {
      store.channel_messages.unshift({
        id: msgId,
        createdAt: new Date().toISOString(),
        channel,
        user,
        text,
        reply: requireApproval ? undefined : reply,
      });
      store.channel_messages = store.channel_messages.slice(0, 100);
    });

    if (requireApproval) {
      const approvalId = newId("appr");
      const run = await logRun({
        workflow: "channel",
        status: "pending_approval",
        tokens: usage.totalTokens,
        inputPreview: text.slice(0, 120),
        idempotencyKey: idemKey ?? undefined,
      });
      await updateStore((store) => {
        store.approvals.unshift({
          id: approvalId,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          kind: "channel",
          status: "pending",
          title: `${channel} reply to ${user}`,
          draft: { to: user, body: reply, channel },
          context: { messageId: msgId, text },
          runId: run.id,
        });
      });
      const response = {
        status: "pending_approval",
        approvalId,
        draftReply: reply,
        usage,
        approveUrl: "/approve",
      };
      await saveIdempotentResponse(idemKey, response);
      return NextResponse.json(response);
    }

    const run = await logRun({
      workflow: "channel",
      status: "ok",
      tokens: usage.totalTokens,
      inputPreview: text.slice(0, 120),
      resultPreview: reply.slice(0, 120),
      idempotencyKey: idemKey ?? undefined,
    });

    const response = {
      status: "replied",
      messageId: msgId,
      channel,
      reply,
      runId: run.id,
      usage,
    };
    await saveIdempotentResponse(idemKey, response);
    return NextResponse.json(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Channel flow failed";
    await logRun({
      workflow: "channel",
      status: "error",
      error: message,
      idempotencyKey: idemKey ?? undefined,
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
