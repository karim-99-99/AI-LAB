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
import { invoiceSchema } from "@/lib/schemas";
import { newId, updateStore } from "@/lib/store";
import { buildAndLogUsage } from "@/lib/usage-server";
import { z } from "zod";

const leadSchema = z.object({
  name: z.string().min(1),
  email: z.string().optional(),
  company: z.string().optional(),
  notes: z.string().optional(),
});

export async function POST(request: Request) {
  const blocked = guardRequest(request);
  if (blocked) return blocked;

  const idemKey = readIdempotencyKey(request);
  const cached = await getIdempotentResponse(idemKey);
  if (cached) return NextResponse.json(cached);

  try {
    const body = await request.json();
    const text = String(body.text ?? body.lead ?? "").trim();
    const source = String(body.source ?? "webhook").trim();

    if (!text) {
      return NextResponse.json({ error: "text is required" }, { status: 400 });
    }

    const model = getModelForTask("automation_crm");
    const completion = await getOpenAI().chat.completions.create({
      model,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `Enrich a CRM lead from raw text. ONLY JSON:
{"name":"...","email":"...","company":"...","notes":"..."}`,
        },
        { role: "user", content: text.slice(0, 8000) },
      ],
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw);
    const validated = leadSchema.safeParse(parsed);
    if (!validated.success) {
      await logRun({
        workflow: "crm",
        status: "error",
        error: "Zod validation failed",
        idempotencyKey: idemKey ?? undefined,
      });
      return NextResponse.json(
        { error: "JSON failed Zod validation", details: validated.error.flatten() },
        { status: 502 }
      );
    }

    let linkedExtractionId: string | undefined;
    if (/invoice/i.test(text)) {
      try {
        const invCompletion = await getOpenAI().chat.completions.create({
          model,
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content: `Extract invoice JSON:
{"type":"invoice","vendor":"...","invoiceNumber":"...","date":"...","total":0,"currency":"USD","lineItems":[{"description":"...","amount":0}]}`,
            },
            { role: "user", content: text.slice(0, 8000) },
          ],
        });
        const invRaw = invCompletion.choices[0]?.message?.content ?? "{}";
        const invParsed = invoiceSchema.safeParse(JSON.parse(invRaw));
        if (invParsed.success) {
          linkedExtractionId = newId("ext");
          await updateStore((store) => {
            store.extractions.unshift({
              id: linkedExtractionId!,
              createdAt: new Date().toISOString(),
              type: "invoice",
              data: invParsed.data as unknown as Record<string, unknown>,
              rawTextPreview: text.slice(0, 200),
            });
          });
        }
      } catch {
        /* optional path */
      }
    }

    const usage = buildAndLogUsage(model, completion.usage, { route: "/api/automation/crm" });
    const crmId = newId("crm");
    await updateStore((store) => {
      store.crm.unshift({
        id: crmId,
        createdAt: new Date().toISOString(),
        name: validated.data.name,
        email: validated.data.email,
        company: validated.data.company,
        notes: validated.data.notes,
        source,
        data: linkedExtractionId ? { linkedExtractionId } : undefined,
      });
      store.crm = store.crm.slice(0, 100);
    });

    const run = await logRun({
      workflow: "crm",
      status: "ok",
      tokens: usage.totalTokens,
      inputPreview: text.slice(0, 120),
      resultPreview: crmId,
      idempotencyKey: idemKey ?? undefined,
    });

    const response = {
      status: "created",
      crmId,
      lead: validated.data,
      linkedExtractionId,
      runId: run.id,
      usage,
    };
    await saveIdempotentResponse(idemKey, response);
    return NextResponse.json(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : "CRM flow failed";
    await logRun({
      workflow: "crm",
      status: "error",
      error: message,
      idempotencyKey: idemKey ?? undefined,
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(request: Request) {
  const blocked = guardRequest(request);
  if (blocked) return blocked;
  const { readStore } = await import("@/lib/store");
  const store = await readStore();
  return NextResponse.json({ crm: store.crm });
}
