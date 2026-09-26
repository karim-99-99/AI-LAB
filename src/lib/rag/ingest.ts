import { newId } from "@/lib/store";
import { extractPdfTextForRag } from "@/lib/pdf";
import {
  chunkAutoMerge,
  chunkSentences,
  chunkText,
} from "@/lib/rag/chunk";
import { embedTexts, getEmbeddingModel } from "@/lib/rag/embed";
import { saveRagDocument } from "@/lib/rag/store";
import type {
  ChunkMode,
  RagChunk,
  RagDocument,
  RagParent,
} from "@/lib/rag/types";

export type IngestOptions = {
  filename: string;
  buffer: Buffer;
  mode: ChunkMode;
  chunkSize: number;
  overlap: number;
  windowSize: number;
  parentSize: number;
  childSize: number;
  mergeThreshold: number;
  onProgress?: (message: string) => void | Promise<void>;
};

export type IngestResult = {
  document: {
    id: string;
    filename: string;
    createdAt: string;
    charCount: number;
    chunkCount: number;
    embeddingModel: string;
    truncated: boolean;
    textPreview: string;
    chunkMode?: ChunkMode;
    windowSize?: number;
    mergeThreshold?: number;
    parentChunkSize?: number;
    childChunkSize?: number;
    parentCount?: number;
    embeddingDims: number;
  };
  chunks: {
    id: string;
    index: number;
    text: string;
    windowText?: string;
    parentId?: string;
    parentIndex?: number;
    charStart: number;
    charEnd: number;
    embeddingDims: number;
  }[];
  parents?: {
    id: string;
    index: number;
    childCount: number;
    textPreview: string;
  }[];
  note: string;
};

export async function performRagIngest(
  options: IngestOptions
): Promise<IngestResult> {
  const {
    filename,
    buffer,
    mode,
    chunkSize,
    overlap,
    windowSize,
    parentSize,
    childSize,
    mergeThreshold,
    onProgress,
  } = options;

  await onProgress?.("Extracting PDF text…");
  const extracted = await extractPdfTextForRag(buffer);
  const docId = newId("rag");
  const embeddingModel = getEmbeddingModel();

  let chunks: RagChunk[] = [];
  let parents: RagParent[] | undefined;

  await onProgress?.(`Chunking (${mode})…`);

  if (mode === "auto_merging") {
    const tree = chunkAutoMerge(extracted.text, {
      parentSize,
      childSize,
    });
    if (!tree.children.length) {
      throw new Error("No text chunks produced from PDF");
    }

    await onProgress?.(`Embedding ${tree.children.length} children…`);
    const embeddings = await embedTexts(tree.children.map((c) => c.text));
    const parentIdByIndex = new Map<number, string>();
    parents = tree.parents.map((p) => {
      const id = `${docId}_p${p.index}`;
      parentIdByIndex.set(p.index, id);
      return {
        id,
        index: p.index,
        text: p.text,
        childIds: [],
        charStart: p.charStart,
        charEnd: p.charEnd,
      };
    });

    chunks = tree.children.map((c, i) => {
      const parentId = parentIdByIndex.get(c.parentIndex)!;
      const chunkId = `${docId}_c${i}`;
      const parent = parents!.find((p) => p.id === parentId);
      if (parent) parent.childIds.push(chunkId);
      return {
        id: chunkId,
        index: c.index,
        text: c.text,
        embedding: embeddings[i] ?? [],
        charStart: c.charStart,
        charEnd: c.charEnd,
        parentId,
        parentIndex: c.parentIndex,
      };
    });
  } else if (mode === "sentence_window") {
    const pieces = chunkSentences(extracted.text, { windowSize });
    if (!pieces.length) {
      throw new Error("No text chunks produced from PDF");
    }
    await onProgress?.(`Embedding ${pieces.length} sentences…`);
    const embeddings = await embedTexts(pieces.map((p) => p.text));
    chunks = pieces.map((p, i) => {
      const base: RagChunk = {
        id: `${docId}_c${i}`,
        index: p.index,
        text: p.text,
        embedding: embeddings[i] ?? [],
        charStart: p.charStart,
        charEnd: p.charEnd,
      };
      if (p.windowText) base.windowText = p.windowText;
      return base;
    });
  } else {
    const pieces = chunkText(extracted.text, { chunkSize, overlap });
    if (!pieces.length) {
      throw new Error("No text chunks produced from PDF");
    }
    await onProgress?.(`Embedding ${pieces.length} chunks…`);
    const embeddings = await embedTexts(pieces.map((p) => p.text));
    chunks = pieces.map((p, i) => ({
      id: `${docId}_c${i}`,
      index: p.index,
      text: p.text,
      embedding: embeddings[i] ?? [],
      charStart: p.charStart,
      charEnd: p.charEnd,
    }));
  }

  const missing = chunks.filter((c) => !c.embedding.length).length;
  if (missing) {
    throw new Error(`Failed to embed ${missing} chunk(s)`);
  }

  await onProgress?.("Saving document…");

  const doc: RagDocument = {
    id: docId,
    filename: filename || "document.pdf",
    createdAt: new Date().toISOString(),
    charCount: extracted.text.length,
    chunkCount: chunks.length,
    embeddingModel,
    truncated: extracted.truncated,
    textPreview: extracted.text.slice(0, 400),
    chunkMode: mode,
    ...(mode === "sentence_window" ? { windowSize } : {}),
    ...(mode === "auto_merging"
      ? {
          mergeThreshold,
          parentChunkSize: parentSize,
          childChunkSize: childSize,
          parents,
        }
      : {}),
    chunks,
  };

  await saveRagDocument(doc);

  const note =
    mode === "auto_merging"
      ? `Auto-merge ingest — ${parents?.length ?? 0} parents, ${chunks.length} children`
      : mode === "sentence_window"
        ? "Sentence-window ingest — sentences embedded; windows stored for synthesis"
        : "Basic ingest — PDF → chunks → embeddings stored";

  return {
    document: {
      id: doc.id,
      filename: doc.filename,
      createdAt: doc.createdAt,
      charCount: doc.charCount,
      chunkCount: doc.chunkCount,
      embeddingModel: doc.embeddingModel,
      truncated: doc.truncated,
      textPreview: doc.textPreview,
      chunkMode: doc.chunkMode,
      windowSize: doc.windowSize,
      mergeThreshold: doc.mergeThreshold,
      parentChunkSize: doc.parentChunkSize,
      childChunkSize: doc.childChunkSize,
      parentCount: parents?.length,
      embeddingDims: chunks[0]?.embedding.length ?? 0,
    },
    chunks: chunks.map((c) => ({
      id: c.id,
      index: c.index,
      text: c.text,
      windowText: c.windowText,
      parentId: c.parentId,
      parentIndex: c.parentIndex,
      charStart: c.charStart,
      charEnd: c.charEnd,
      embeddingDims: c.embedding.length,
    })),
    parents: parents?.map((p) => ({
      id: p.id,
      index: p.index,
      childCount: p.childIds.length,
      textPreview: p.text.slice(0, 180),
    })),
    note,
  };
}

export function parseIngestMode(modeRaw: string): ChunkMode {
  if (modeRaw === "sentence_window") return "sentence_window";
  if (modeRaw === "auto_merging") return "auto_merging";
  return "basic";
}
