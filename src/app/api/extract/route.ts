import { NextResponse } from "next/server";
import { getOpenAI } from "@/lib/openai";
import { getModelForTask } from "@/lib/model-router";
import { guardRequest } from "@/lib/guard";
import { extractionSchema } from "@/lib/schemas";
import { newId, updateStore } from "@/lib/store";
import { buildAndLogUsage } from "@/lib/usage-server";

export async function POST(request: Request) {
  const blocked = guardRequest(request);
  if (blocked) return blocked;

  try {
    const body = await request.json();
    const text = String(body.text ?? "").trim();
    const kind = body.kind === "form" ? "form" : "invoice";

    if (!text) {
      return NextResponse.json({ error: "text is required" }, { status: 400 });
    }

    const model = getModelForTask("extract");
    const system =
      kind === "invoice"
        ? `Extract invoice data. Respond with ONLY valid JSON:
{"type":"invoice","vendor":"...","invoiceNumber":"...","date":"YYYY-MM-DD","total":0,"currency":"USD","lineItems":[{"description":"...","amount":0}]}
If a field is missing, invent a best-effort placeholder from context or use "unknown".`
        : `Extract form submission data. Respond with ONLY valid JSON:
{"type":"form","formName":"...","fields":{"key":"value"}}`;

    const completion = await getOpenAI().chat.completions.create({
      model,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: text.slice(0, 12000) },
      ],
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return NextResponse.json(
        { error: "Model returned invalid JSON", raw },
        { status: 502 }
      );
    }

    const validated = extractionSchema.safeParse(parsed);
    if (!validated.success) {
      return NextResponse.json(
        {
          error: "JSON failed Zod validation",
          details: validated.error.flatten(),
          raw: parsed,
        },
        { status: 502 }
      );
    }

    const recordId = newId("ext");
    await updateStore((store) => {
      store.extractions.unshift({
        id: recordId,
        createdAt: new Date().toISOString(),
        type: validated.data.type,
        data: validated.data as unknown as Record<string, unknown>,
        rawTextPreview: text.slice(0, 200),
      });
      store.extractions = store.extractions.slice(0, 100);
    });

    return NextResponse.json({
      extraction: validated.data,
      id: recordId,
      usage: buildAndLogUsage(model, completion.usage, { route: "/api/extract" }),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Extract failed";
    console.error("[/api/extract]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(request: Request) {
  const blocked = guardRequest(request);
  if (blocked) return blocked;

  const { readStore } = await import("@/lib/store");
  const store = await readStore();
  return NextResponse.json({ extractions: store.extractions });
}
