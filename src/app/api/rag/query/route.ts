import { NextResponse } from "next/server";
import { getOpenAI } from "@/lib/openai";
import { getModelForTask } from "@/lib/model-router";
import { guardRequest } from "@/lib/guard";
import { buildAndLogUsage } from "@/lib/usage-server";
import {
  cacheGet,
  cacheSet,
  getCacheBackend,
  getCacheTtlSeconds,
  ragCacheKey,
} from "@/lib/cache";
import {
  formatContextForPrompt,
  retrieveChunks,
} from "@/lib/rag/retrieve";
import {
  getMaxOutputTokens,
  guardModelOutput,
  guardUserInput,
  newRequestId,
} from "@/lib/guardrails";

// Embedding model may need to load on a cold start.
export const maxDuration = 60;

const DEFAULT_MIN_SCORE = 0.25;

export async function POST(request: Request) {
  const blocked = guardRequest(request);
  if (blocked) return blocked;

  const requestId = newRequestId();

  try {
    const body = await request.json();
    const gated = guardUserInput(String(body.question ?? ""), {
      field: "question",
    });
    if (!gated.ok) {
      return NextResponse.json(
        {
          error: gated.error,
          guardrails: gated.hits,
          requestId,
        },
        { status: 400 }
      );
    }
    const question = gated.cleaned;
    const documentId =
      typeof body.documentId === "string" && body.documentId
        ? body.documentId
        : null;
    const topK = Number(body.topK ?? 4);
    const minScore = Number(body.minScore ?? DEFAULT_MIN_SCORE);
    const skipCache = body.skipCache === true;

    const model = getModelForTask("rag_answer");
    const cacheKey = ragCacheKey({
      question,
      documentId,
      topK: Number.isFinite(topK) ? topK : 4,
      minScore: Number.isFinite(minScore) ? minScore : DEFAULT_MIN_SCORE,
      model,
    });

    if (!skipCache) {
      const cached = await cacheGet(cacheKey);
      if (cached) {
        try {
          const payload = JSON.parse(cached) as Record<string, unknown>;
          return NextResponse.json({
            ...payload,
            cacheHit: true,
            cacheBackend: getCacheBackend(),
            cacheTtlSeconds: getCacheTtlSeconds(),
            usage: null,
            requestId,
            guardWarnings: gated.warnings,
          });
        } catch {
          // bad cache entry — ignore and recompute
        }
      }
    }

    const { hits, bestScore } = await retrieveChunks(question, {
      documentId,
      topK: Number.isFinite(topK) ? topK : 4,
    });

    const retrieved = hits.map((h) => ({
      documentId: h.documentId,
      filename: h.filename,
      chunkId: h.chunkId,
      index: h.index,
      text: h.text,
      matchedText: h.matchedText,
      mode: h.mode,
      merged: h.merged ?? false,
      parentId: h.parentId,
      score: Number(h.score.toFixed(4)),
    }));

    if (!hits.length || bestScore < minScore) {
      const payload = {
        status: "insufficient_context" as const,
        answer:
          "I don't know based on the uploaded documents. The retrieved chunks were too weak or missing.",
        citations: [] as unknown[],
        retrieved,
        bestScore: Number(bestScore.toFixed(4)),
        minScore,
      };
      const backend = await cacheSet(cacheKey, JSON.stringify(payload));
      return NextResponse.json({
        ...payload,
        cacheHit: false,
        cacheBackend: backend,
        cacheTtlSeconds: getCacheTtlSeconds(),
        usage: null,
        requestId,
        guardWarnings: gated.warnings,
      });
    }

    const context = formatContextForPrompt(hits);
    const completion = await getOpenAI().chat.completions.create({
      model,
      temperature: 0.2,
      max_tokens: getMaxOutputTokens(1024),
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
          content: `Context:\n${context}\n\nQuestion: ${question}`,
        },
      ],
    });

    const rawAnswer =
      completion.choices[0]?.message?.content?.trim() ||
      "I don't know based on the provided documents.";
    const guardedOut = guardModelOutput(rawAnswer);

    const citations = hits.map((h, i) => ({
      n: i + 1,
      filename: h.filename,
      chunkIndex: h.index,
      chunkId: h.chunkId,
      score: Number(h.score.toFixed(4)),
      excerpt: h.text.slice(0, 220),
    }));

    const payload = {
      status: "ok" as const,
      answer: guardedOut.text,
      citations,
      retrieved,
      bestScore: Number(bestScore.toFixed(4)),
      minScore,
    };

    const backend = await cacheSet(cacheKey, JSON.stringify(payload));

    return NextResponse.json({
      ...payload,
      cacheHit: false,
      cacheBackend: backend,
      cacheTtlSeconds: getCacheTtlSeconds(),
      usage: buildAndLogUsage(model, completion.usage, {
        route: "/api/rag/query",
        requestId,
      }),
      requestId,
      guardWarnings: [...gated.warnings, ...guardedOut.warnings],
      outputTruncated: guardedOut.truncated,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "RAG query failed";
    console.error("[/api/rag/query]", requestId, message);
    return NextResponse.json({ error: message, requestId }, { status: 500 });
  }
}
