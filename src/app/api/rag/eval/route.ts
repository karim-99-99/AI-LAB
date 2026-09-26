import { NextResponse } from "next/server";
import { guardRequest } from "@/lib/guard";
import { DEFAULT_EVAL_SET } from "@/lib/rag/eval-set";
import { runRagEval } from "@/lib/rag/run-eval";

// Runs the whole eval set (many retrievals + LLM calls).
export const maxDuration = 60;

export async function GET(request: Request) {
  const blocked = guardRequest(request);
  if (blocked) return blocked;
  return NextResponse.json({
    questions: DEFAULT_EVAL_SET,
    note: "Default eval set (15Qs). Customize by POSTing your own questions.",
  });
}

export async function POST(request: Request) {
  const blocked = guardRequest(request);
  if (blocked) return blocked;

  try {
    const body = await request.json().catch(() => ({}));
    const documentId =
      typeof body.documentId === "string" && body.documentId
        ? body.documentId
        : null;
    const topK = Number(body.topK ?? 4);
    const minScore = Number(body.minScore ?? 0.25);
    const scoreTriad = body.scoreTriad !== false;
    const limit = Number(body.limit ?? 15);
    const questions = Array.isArray(body.questions)
      ? body.questions
      : undefined;

    const result = await runRagEval({
      documentId,
      topK: Number.isFinite(topK) ? topK : 4,
      minScore: Number.isFinite(minScore) ? minScore : 0.25,
      scoreTriad,
      questions,
      limit: Number.isFinite(limit) ? Math.min(limit, 25) : 15,
    });

    return NextResponse.json({
      ...result,
      note: "Eval finished. pass = expect(should_answer|should_refuse) matched behavior. Triad scores are LLM-judged 0–1.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "RAG eval failed";
    console.error("[/api/rag/eval]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
