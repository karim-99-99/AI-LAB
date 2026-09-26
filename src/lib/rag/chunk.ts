export type ChunkOptions = {
  /** Target chunk size in characters (approx). Default 800 */
  chunkSize?: number;
  /** Overlap between chunks in characters. Default 120 */
  overlap?: number;
};

export type TextChunk = {
  index: number;
  text: string;
  charStart: number;
  charEnd: number;
};

/**
 * Simple visible chunker (no LlamaIndex).
 * Prefers breaking on paragraph/sentence boundaries when possible.
 */
export function chunkText(text: string, options: ChunkOptions = {}): TextChunk[] {
  const chunkSize = options.chunkSize ?? 800;
  const overlap = options.overlap ?? 120;
  const cleaned = text.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();

  if (!cleaned) return [];

  const chunks: TextChunk[] = [];
  let start = 0;
  let index = 0;

  while (start < cleaned.length) {
    let end = Math.min(start + chunkSize, cleaned.length);

    if (end < cleaned.length) {
      const window = cleaned.slice(start, end);
      const breakAt = Math.max(
        window.lastIndexOf("\n\n"),
        window.lastIndexOf(". "),
        window.lastIndexOf("? "),
        window.lastIndexOf("! "),
        window.lastIndexOf("\n")
      );
      if (breakAt > chunkSize * 0.4) {
        end = start + breakAt + (window[breakAt] === "." ? 1 : 0);
        if (cleaned[end] === " ") end += 1;
      }
    }

    const slice = cleaned.slice(start, end).trim();
    if (slice) {
      chunks.push({
        index,
        text: slice,
        charStart: start,
        charEnd: end,
      });
      index += 1;
    }

    if (end >= cleaned.length) break;
    start = Math.max(end - overlap, start + 1);
  }

  return chunks;
}

export type SentenceWindowOptions = {
  /** Sentences before + after the match included in synthesis text. Default 3 */
  windowSize?: number;
};

export type SentenceWindowChunk = {
  index: number;
  /** Small text used for embedding / search */
  text: string;
  /** Expanded neighbor window used for LLM synthesis */
  windowText: string;
  charStart: number;
  charEnd: number;
};

/**
 * Sentence-window chunker (course Step 4).
 * Embed/search on one sentence; synthesize with surrounding window.
 */
export function chunkSentences(
  text: string,
  options: SentenceWindowOptions = {}
): SentenceWindowChunk[] {
  const windowSize = Math.max(0, options.windowSize ?? 3);
  const cleaned = text.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (!cleaned) return [];

  const parts = cleaned
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  if (!parts.length) return [];

  // Track approximate char offsets for learning/debug
  const offsets: { start: number; end: number }[] = [];
  let cursor = 0;
  for (const sentence of parts) {
    const start = cleaned.indexOf(sentence, cursor);
    const safeStart = start >= 0 ? start : cursor;
    const end = safeStart + sentence.length;
    offsets.push({ start: safeStart, end });
    cursor = end;
  }

  return parts.map((sentence, i) => {
    const from = Math.max(0, i - windowSize);
    const to = Math.min(parts.length - 1, i + windowSize);
    const windowText = parts.slice(from, to + 1).join(" ");
    return {
      index: i,
      text: sentence,
      windowText,
      charStart: offsets[i]!.start,
      charEnd: offsets[i]!.end,
    };
  });
}

export type AutoMergeOptions = {
  /** Parent chunk size (chars). Default 1600 */
  parentSize?: number;
  /** Child chunk size (chars). Default 400 */
  childSize?: number;
  /** Overlap for child splits. Default 40 */
  childOverlap?: number;
};

export type AutoMergeParent = {
  index: number;
  text: string;
  charStart: number;
  charEnd: number;
};

export type AutoMergeChild = {
  index: number;
  text: string;
  charStart: number;
  charEnd: number;
  parentIndex: number;
};

/**
 * Hierarchical chunker for auto-merging retrieval.
 * Parents = coherent big sections; children = small searchable pieces.
 */
export function chunkAutoMerge(
  text: string,
  options: AutoMergeOptions = {}
): { parents: AutoMergeParent[]; children: AutoMergeChild[] } {
  const parentSize = options.parentSize ?? 1600;
  const childSize = options.childSize ?? 400;
  const childOverlap = options.childOverlap ?? 40;

  const parentPieces = chunkText(text, {
    chunkSize: parentSize,
    overlap: Math.min(120, Math.floor(parentSize * 0.08)),
  });

  const parents: AutoMergeParent[] = parentPieces.map((p) => ({
    index: p.index,
    text: p.text,
    charStart: p.charStart,
    charEnd: p.charEnd,
  }));

  const children: AutoMergeChild[] = [];
  let childIndex = 0;

  for (const parent of parents) {
    const kids = chunkText(parent.text, {
      chunkSize: childSize,
      overlap: childOverlap,
    });
    for (const kid of kids) {
      children.push({
        index: childIndex,
        text: kid.text,
        charStart: parent.charStart + kid.charStart,
        charEnd: parent.charStart + kid.charEnd,
        parentIndex: parent.index,
      });
      childIndex += 1;
    }
  }

  return { parents, children };
}
