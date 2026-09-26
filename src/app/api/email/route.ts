import { NextResponse } from "next/server";
import { getOpenAI } from "@/lib/openai";
import { getModelForTask } from "@/lib/model-router";
import { guardRequest } from "@/lib/guard";
import { emailOutputSchema } from "@/lib/schemas";
import { buildAndLogUsage } from "@/lib/usage-server";

export async function POST(request: Request) {
  const blocked = guardRequest(request);
  if (blocked) return blocked;

  try {
    const body = await request.json();
    const purpose = String(body.purpose ?? "").trim();
    const tone = String(body.tone ?? "professional").trim();
    const recipient = String(body.recipient ?? "").trim();
    const keyPoints = String(body.keyPoints ?? "").trim();

    if (!purpose || !recipient || !keyPoints) {
      return NextResponse.json(
        { error: "purpose, recipient, and keyPoints are required" },
        { status: 400 }
      );
    }

    const model = getModelForTask("email");
    const completion = await getOpenAI().chat.completions.create({
      model,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You write emails. Respond with ONLY valid JSON matching this shape:
{"subject":"string","body":"string","cta":"string"}
- subject: short email subject
- body: full email body (greeting + paragraphs + sign-off placeholder)
- cta: one clear call-to-action sentence`,
        },
        {
          role: "user",
          content: `Purpose: ${purpose}
Tone: ${tone}
Recipient: ${recipient}
Key points:
${keyPoints}`,
        },
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

    const validated = emailOutputSchema.safeParse(parsed);
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

    const usage = buildAndLogUsage(model, completion.usage, { route: "/api/email" });
    return NextResponse.json({ email: validated.data, usage });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Email failed";
    console.error("[/api/email]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
