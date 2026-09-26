import { NextResponse } from "next/server";
import { getOpenAI } from "@/lib/openai";
import { getModelForTask } from "@/lib/model-router";
import { guardRequest } from "@/lib/guard";
import { blogOutputSchema } from "@/lib/schemas";
import { buildAndLogUsage } from "@/lib/usage-server";

export async function POST(request: Request) {
  const blocked = guardRequest(request);
  if (blocked) return blocked;

  try {
    const body = await request.json();
    const topic = String(body.topic ?? "").trim();
    const audience = String(body.audience ?? "developers").trim();
    const tone = String(body.tone ?? "practical").trim();

    if (!topic) {
      return NextResponse.json({ error: "topic is required" }, { status: 400 });
    }

    const model = getModelForTask("blog");
    const completion = await getOpenAI().chat.completions.create({
      model,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You are a blog writing assistant. Respond with ONLY valid JSON:
{"title":"string","outline":["section 1","section 2",...],"draft":"full markdown draft"}
Keep the draft useful and concrete (600–900 words when possible).`,
        },
        {
          role: "user",
          content: `Topic: ${topic}\nAudience: ${audience}\nTone: ${tone}`,
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

    const validated = blogOutputSchema.safeParse(parsed);
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

    return NextResponse.json({
      blog: validated.data,
      usage: buildAndLogUsage(model, completion.usage, { route: "/api/blog" }),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Blog failed";
    console.error("[/api/blog]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
