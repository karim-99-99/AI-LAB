import { NextResponse } from "next/server";
import { getOpenAI } from "@/lib/openai";
import { getModelForTask } from "@/lib/model-router";
import { guardRequest } from "@/lib/guard";
import { grammarOutputSchema } from "@/lib/schemas";
import { buildAndLogUsage } from "@/lib/usage-server";

export async function POST(request: Request) {
  const blocked = guardRequest(request);
  if (blocked) return blocked;

  try {
    const body = await request.json();
    const text = typeof body.text === "string" ? body.text.trim() : "";

    if (!text) {
      return NextResponse.json({ error: "text is required" }, { status: 400 });
    }

    const model = getModelForTask("grammar");
    const completion = await getOpenAI().chat.completions.create({
      model,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You are a grammar and clarity checker. Respond with ONLY valid JSON:
{"corrected":"string","issues":[{"original":"string","suggestion":"string","reason":"string"}]}
- corrected: the full improved text
- issues: list of specific fixes (empty array if none)
Keep the author's meaning. Fix grammar, spelling, and awkward phrasing.`,
        },
        { role: "user", content: text },
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

    const validated = grammarOutputSchema.safeParse(parsed);
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

    const usage = buildAndLogUsage(model, completion.usage, { route: "/api/grammar" });
    return NextResponse.json({ result: validated.data, usage });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Grammar failed";
    console.error("[/api/grammar]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
