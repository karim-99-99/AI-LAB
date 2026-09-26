import { NextResponse } from "next/server";
import { getOpenAI } from "@/lib/openai";
import { getModelForTask } from "@/lib/model-router";
import { guardRequest } from "@/lib/guard";
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

    const model = getModelForTask("summarize");
    const completion = await getOpenAI().chat.completions.create({
      model,
      messages: [
        {
          role: "system",
          content:
            "Summarize the user's text in 3–5 short bullet points. Keep only the key ideas. No preamble.",
        },
        { role: "user", content: text },
      ],
    });

    const summary = completion.choices[0]?.message?.content ?? "";
    const usage = buildAndLogUsage(model, completion.usage, { route: "/api/summarize" });

    return NextResponse.json({ summary, usage });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Summarize failed";
    console.error("[/api/summarize]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
