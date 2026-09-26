import { getOpenAI } from "@/lib/openai";
import { getModelForTask } from "@/lib/model-router";
import { buildAndLogUsage } from "@/lib/usage-server";
import type { UsageInfo } from "@/lib/usage";
import { DEFAULT_EVAL_SET, type EvalQuestion } from "./eval-set";
import {
  formatContextForPrompt,
  retrieveChunks,
  type RetrievedChunk,
} from "./retrieve";

export type TriadScores = {
  contextRelevance: number;
  groundedness: number;
  answerRelevance: number;
};

export type EvalRow = {
  id: string;
  question: string;
  expect: EvalQuestion["expect"];
  note?: string;
  status: string;
  answer: string;
  bestScore: number;
  pass: boolean;
  retrievedCount: number;
  mergedCount: number;
  triad: TriadScores | null;
  usage: UsageInfo | null;
};

function looksLikeDontKnow(answer: string): boolean {
  const a = answer.toLowerCase();
  return (
    a.includes("i don't know") ||
    a.includes("i do not know") ||
    a.includes("insufficient") ||
    a.includes("not enough") ||
    (a.includes("based on the provided documents") && a.includes("don't"))
  );
}

async function answerOne(
  question: string,
  documentId: string | null,
  topK: number,
  minScore: number
): Promise<{
  status: string;
  answer: string;
  bestScore: number;
  hits: RetrievedChunk[];
  usage: UsageInfo | null;
}> {
  const { hits, bestScore } = await retrieveChunks(question, {
    documentId,
    topK,
  });

  if (!hits.length || bestScore < minScore) {
    return {
      status: "insufficient_context",
      answer:
        "I don't know based on the uploaded documents. The retrieved chunks were too weak or missing.",
      bestScore,
      hits,
      usage: null,
    };
  }

  const model = getModelForTask("rag_answer");
  const completion = await getOpenAI().chat.completions.create({
    model,
    temperature: 0.2,
    messages: [
      {
        role: "system",
        content: `You are a careful RAG assistant.
Answer ONLY using the provided context chunks.
If the context is not enough, say exactly: I don't know based on the provided documents.
When you use information, cite chunk numbers like [1], [2].
Do not invent facts outside the context.`,
      },
      {
        role: "user",
        content: `Context:\n${formatContextForPrompt(hits)}\n\nQuestion: ${question}`,
      },
    ],
  });

  return {
    status: "ok",
    answer:
      completion.choices[0]?.message?.content?.trim() ||
      "I don't know based on the provided documents.",
    bestScore,
    hits,
    usage: buildAndLogUsage(model, completion.usage, { route: "/api/rag/eval" }),
  };
}

async function scoreTriad(
  question: string,
  context: string,
  answer: string
): Promise<TriadScores | null> {
  try {
    const model = getModelForTask("rag_eval_judge");
    const completion = await getOpenAI().chat.completions.create({
      model,
      temperature: 0,
      messages: [
        {
          role: "system",
          content: `You evaluate RAG outputs. Return ONLY JSON:
{"contextRelevance":0-1,"groundedness":0-1,"answerRelevance":0-1}
- contextRelevance: do retrieved chunks relate to the question?
- groundedness: is the answer supported by the context (no invented facts)?
- answerRelevance: does the answer address the question?
If the answer is a refusal ("I don't know") and the question is off-topic for the context, score high groundedness and answerRelevance.`,
        },
        {
          role: "user",
          content: `Question: ${question}\n\nContext:\n${context.slice(0, 6000)}\n\nAnswer:\n${answer}`,
        },
      ],
    });
    const raw = completion.choices[0]?.message?.content ?? "";
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]) as TriadScores;
    return {
      contextRelevance: clamp01(parsed.contextRelevance),
      groundedness: clamp01(parsed.groundedness),
      answerRelevance: clamp01(parsed.answerRelevance),
    };
  } catch {
    return null;
  }
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

export async function runRagEval(options: {
  documentId?: string | null;
  topK?: number;
  minScore?: number;
  scoreTriad?: boolean;
  questions?: EvalQuestion[];
  limit?: number;
}): Promise<{
  rows: EvalRow[];
  summary: {
    total: number;
    passed: number;
    failed: number;
    avgBestScore: number;
    avgContextRelevance: number | null;
    avgGroundedness: number | null;
    avgAnswerRelevance: number | null;
  };
}> {
  const questions = (options.questions ?? DEFAULT_EVAL_SET).slice(
    0,
    options.limit ?? 15
  );
  const topK = options.topK ?? 4;
  const minScore = options.minScore ?? 0.25;
  const documentId = options.documentId ?? null;
  const doTriad = options.scoreTriad ?? true;

  const rows: EvalRow[] = [];

  for (const q of questions) {
    const result = await answerOne(q.question, documentId, topK, minScore);
    const refused =
      result.status === "insufficient_context" ||
      looksLikeDontKnow(result.answer);

    const pass =
      q.expect === "should_refuse" ? refused : !refused && result.status === "ok";

    let triad: TriadScores | null = null;
    if (doTriad) {
      triad = await scoreTriad(
        q.question,
        formatContextForPrompt(result.hits),
        result.answer
      );
    }

    rows.push({
      id: q.id,
      question: q.question,
      expect: q.expect,
      note: q.note,
      status: result.status,
      answer: result.answer,
      bestScore: Number(result.bestScore.toFixed(4)),
      pass,
      retrievedCount: result.hits.length,
      mergedCount: result.hits.filter((h) => h.merged).length,
      triad,
      usage: result.usage,
    });
  }

  const passed = rows.filter((r) => r.pass).length;
  const triadRows = rows.filter((r) => r.triad);
  const avg = (pick: (t: TriadScores) => number) =>
    triadRows.length
      ? Number(
          (
            triadRows.reduce((s, r) => s + pick(r.triad!), 0) / triadRows.length
          ).toFixed(3)
        )
      : null;

  return {
    rows,
    summary: {
      total: rows.length,
      passed,
      failed: rows.length - passed,
      avgBestScore: Number(
        (
          rows.reduce((s, r) => s + r.bestScore, 0) / Math.max(rows.length, 1)
        ).toFixed(4)
      ),
      avgContextRelevance: avg((t) => t.contextRelevance),
      avgGroundedness: avg((t) => t.groundedness),
      avgAnswerRelevance: avg((t) => t.answerRelevance),
    },
  };
}
