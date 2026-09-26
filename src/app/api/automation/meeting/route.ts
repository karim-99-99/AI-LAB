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
import { meetingOutputSchema } from "@/lib/schemas";
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
    const transcript = String(body.transcript ?? body.text ?? "").trim();
    const notifyEmail = String(body.notifyEmail ?? "").trim();

    if (!transcript) {
      return NextResponse.json(
        { error: "transcript is required" },
        { status: 400 }
      );
    }

    const model = getModelForTask("automation_meeting");
    const completion = await getOpenAI().chat.completions.create({
      model,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `Summarize a meeting transcript. ONLY JSON:
{"summary":"...","tasks":["..."],"decisions":["..."]}`,
        },
        { role: "user", content: transcript.slice(0, 14000) },
      ],
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw);
    const validated = meetingOutputSchema.safeParse(parsed);
    if (!validated.success) {
      await logRun({
        workflow: "meeting",
        status: "error",
        error: "Zod validation failed",
        idempotencyKey: idemKey ?? undefined,
      });
      return NextResponse.json(
        { error: "JSON failed Zod validation", details: validated.error.flatten() },
        { status: 502 }
      );
    }

    const usage = buildAndLogUsage(model, completion.usage, { route: "/api/automation/meeting" });
    const meetingId = newId("meet");

    await updateStore((store) => {
      store.meetings.unshift({
        id: meetingId,
        createdAt: new Date().toISOString(),
        summary: validated.data.summary,
        tasks: validated.data.tasks,
        transcriptPreview: transcript.slice(0, 200),
      });
      store.meetings = store.meetings.slice(0, 50);

      if (notifyEmail) {
        store.outbox.unshift({
          id: newId("out"),
          createdAt: new Date().toISOString(),
          channel: "email",
          to: notifyEmail,
          subject: "Meeting summary",
          body: `${validated.data.summary}\n\nTasks:\n${validated.data.tasks
            .map((t) => `- ${t}`)
            .join("\n")}`,
          status: "sent",
          meta: { meetingId },
        });
      }
    });

    const run = await logRun({
      workflow: "meeting",
      status: "ok",
      tokens: usage.totalTokens,
      inputPreview: transcript.slice(0, 120),
      resultPreview: meetingId,
      idempotencyKey: idemKey ?? undefined,
    });

    const response = {
      status: "ok",
      meetingId,
      meeting: validated.data,
      runId: run.id,
      usage,
    };
    await saveIdempotentResponse(idemKey, response);
    return NextResponse.json(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Meeting flow failed";
    await logRun({
      workflow: "meeting",
      status: "error",
      error: message,
      idempotencyKey: idemKey ?? undefined,
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
