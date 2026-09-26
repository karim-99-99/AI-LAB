import { NextResponse } from "next/server";
import { getOpenAI } from "@/lib/openai";
import { getModelForTask } from "@/lib/model-router";
import { guardRequest } from "@/lib/guard";
import { extractPdfText } from "@/lib/pdf";
import { buildAndLogUsage } from "@/lib/usage-server";

export const maxDuration = 60;

export async function POST(request: Request) {
  const blocked = guardRequest(request);
  if (blocked) return blocked;

  try {
    const contentType = request.headers.get("content-type") || "";
    let text = "";
    let truncated = false;
    let mode = "short";

    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      mode = String(form.get("mode") ?? "short");
      const file = form.get("file");
      if (!(file instanceof File)) {
        return NextResponse.json({ error: "file is required" }, { status: 400 });
      }
      if (file.size > 5 * 1024 * 1024) {
        return NextResponse.json(
          { error: "PDF must be under 5MB" },
          { status: 400 }
        );
      }
      const buffer = Buffer.from(await file.arrayBuffer());
      const extracted = await extractPdfText(buffer);
      text = extracted.text;
      truncated = extracted.truncated;
    } else {
      const body = await request.json();
      text = String(body.text ?? "").trim();
      mode = String(body.mode ?? "short");
      if (!text) {
        return NextResponse.json(
          { error: "Provide multipart file or JSON text" },
          { status: 400 }
        );
      }
    }

    const modePrompt =
      mode === "bullets"
        ? "Summarize as 5–8 bullet points."
        : mode === "medium"
          ? "Write a medium summary (1–2 short paragraphs)."
          : "Write a short summary (3–4 sentences).";

    const model = getModelForTask("pdf_summarize");
    const completion = await getOpenAI().chat.completions.create({
      model,
      messages: [
        {
          role: "system",
          content: `You summarize PDF/document text. ${modePrompt} No preamble.`,
        },
        { role: "user", content: text },
      ],
    });

    return NextResponse.json({
      summary: completion.choices[0]?.message?.content ?? "",
      truncated,
      usage: buildAndLogUsage(model, completion.usage, { route: "/api/pdf-summarize" }),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "PDF summarize failed";
    console.error("[/api/pdf-summarize]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
