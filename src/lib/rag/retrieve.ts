import { cosineSimilarity, embedQuery } from "./embed";
import { getRagDocument, readRagStore } from "./store";
import type { ChunkMode, RagDocument, RagParent } from "./types";

export type RetrievedChunk = {
  documentId: string;
  filename: string;
  chunkId: string;
  index: number;
  /** Text sent to the LLM */
  text: string;
  /** Leaf text that was scored (may be smaller than `text`) */
  matchedText: string;
  score: number;
  mode: ChunkMode;
  /** True when child hits were replaced by parent */
  merged?: boolean;
  parentId?: string;
};

export type RetrieveOptions = {
  documentId?: string | null;
  topK?: number;
  minScore?: number;
};

/**
 * Embed the question and return top-K most similar chunks (visible retrieval).
 * - sentence_window: score sentence, return window
 * - auto_merging: score children, maybe replace with parent
 */
export async function retrieveChunks(
  question: string,
  options: RetrieveOptions = {}
): Promise<{ hits: RetrievedChunk[]; bestScore: number }> {
  const topK = options.topK ?? 4;
  const store = await readRagStore();

  let docs: RagDocument[] = store.documents;
  if (options.documentId) {
    const one = await getRagDocument(options.documentId);
    docs = one ? [one] : [];
  }

  if (!docs.length) {
    return { hits: [], bestScore: 0 };
  }

  const queryVec = await embedQuery(question);
  const scored: RetrievedChunk[] = [];

  for (const doc of docs) {
    const mode: ChunkMode = doc.chunkMode ?? "basic";
    for (const chunk of doc.chunks) {
      if (!chunk.embedding?.length) continue;
      const score = cosineSimilarity(queryVec, chunk.embedding);
      const synthesisText =
        mode === "sentence_window" && chunk.windowText
          ? chunk.windowText
          : chunk.text;
      scored.push({
        documentId: doc.id,
        filename: doc.filename,
        chunkId: chunk.id,
        index: chunk.index,
        text: synthesisText,
        matchedText: chunk.text,
        score,
        mode,
        parentId: chunk.parentId,
      });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  let hits = scored.slice(0, Math.max(topK * 3, topK)); // fetch extra for merge grouping
  const bestScore = hits[0]?.score ?? 0;

  // Apply auto-merge per document, then trim to topK
  hits = applyAutoMerge(hits, docs, topK);

  const minScore = options.minScore;
  if (typeof minScore === "number") {
    return {
      hits: hits.filter((h) => h.score >= minScore),
      bestScore,
    };
  }

  return { hits, bestScore };
}

function applyAutoMerge(
  hits: RetrievedChunk[],
  docs: RagDocument[],
  topK: number
): RetrievedChunk[] {
  const byDoc = new Map<string, RetrievedChunk[]>();
  for (const h of hits) {
    const list = byDoc.get(h.documentId) ?? [];
    list.push(h);
    byDoc.set(h.documentId, list);
  }

  const out: RetrievedChunk[] = [];

  for (const [docId, docHits] of byDoc) {
    const doc = docs.find((d) => d.id === docId);
    if (!doc || doc.chunkMode !== "auto_merging" || !doc.parents?.length) {
      out.push(...docHits);
      continue;
    }

    const threshold = doc.mergeThreshold ?? 0.5;
    const parentMap = new Map<string, RagParent>(
      doc.parents.map((p) => [p.id, p])
    );

    // Group retrieved children by parent
    const byParent = new Map<string, RetrievedChunk[]>();
    const noParent: RetrievedChunk[] = [];
    for (const h of docHits) {
      if (!h.parentId) {
        noParent.push(h);
        continue;
      }
      const list = byParent.get(h.parentId) ?? [];
      list.push(h);
      byParent.set(h.parentId, list);
    }

    const mergedHits: RetrievedChunk[] = [...noParent];

    for (const [parentId, childHits] of byParent) {
      const parent = parentMap.get(parentId);
      if (!parent) {
        mergedHits.push(...childHits);
        continue;
      }
      const ratio = childHits.length / Math.max(parent.childIds.length, 1);
      if (ratio >= threshold) {
        const best = childHits.reduce((a, b) => (a.score >= b.score ? a : b));
        mergedHits.push({
          documentId: docId,
          filename: best.filename,
          chunkId: parent.id,
          index: parent.index,
          text: parent.text,
          matchedText: childHits.map((c) => c.matchedText).join(" | "),
          score: best.score,
          mode: "auto_merging",
          merged: true,
          parentId,
        });
      } else {
        mergedHits.push(
          ...childHits.map((c) => ({ ...c, mode: "auto_merging" as const }))
        );
      }
    }

    mergedHits.sort((a, b) => b.score - a.score);
    out.push(...mergedHits);
  }

  out.sort((a, b) => b.score - a.score);
  return out.slice(0, topK);
}

export function formatContextForPrompt(hits: RetrievedChunk[]): string {
  return hits
    .map((h, i) => {
      let label = `${h.filename} · #${h.index} · score ${h.score.toFixed(3)}`;
      if (h.mode === "sentence_window") label += " · window";
      if (h.mode === "auto_merging" && h.merged) label += " · merged parent";
      if (h.mode === "auto_merging" && !h.merged) label += " · child";
      return `[${i + 1}] (${label})\n${h.text}`;
    })
    .join("\n\n");
}
