import { NextResponse } from "next/server";
import { getOpenAI } from "@/lib/openai";
import { getModelForTask } from "@/lib/model-router";
import { guardRequest } from "@/lib/guard";
import { resumeOutputSchema } from "@/lib/schemas";
import { buildAndLogUsage } from "@/lib/usage-server";

export async function POST(request: Request) {
  const blocked = guardRequest(request);
  if (blocked) return blocked;

  try {
    const body = await request.json();
    const resume = String(body.resume ?? "").trim();
    const role = String(body.role ?? "software engineer").trim();

    if (!resume) {
      return NextResponse.json({ error: "resume is required" }, { status: 400 });
    }

    const model = getModelForTask("resume");
    const completion = await getOpenAI().chat.completions.create({
      model,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You are a hiring assistant. Score resumes for the target role.
Respond with ONLY valid JSON:
{"overallScore":0-100,"strengths":["..."],"gaps":["..."],"hireRecommendation":"strong_yes"|"yes"|"maybe"|"no","summary":"..."}`,
        },
        {
          role: "user",
          content: `Target role: ${role}\n\nResume:\n${resume.slice(0, 12000)}`,
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

    const validated = resumeOutputSchema.safeParse(parsed);
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
      analysis: validated.data,
      usage: buildAndLogUsage(model, completion.usage, { route: "/api/resume" }),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Resume analysis failed";
    console.error("[/api/resume]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
