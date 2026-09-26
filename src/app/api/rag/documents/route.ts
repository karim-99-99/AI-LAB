import { NextResponse } from "next/server";
import { guardRequest } from "@/lib/guard";
import {
  deleteRagDocument,
  getRagDocument,
  listRagDocuments,
} from "@/lib/rag/store";

export async function GET(request: Request) {
  const blocked = guardRequest(request);
  if (blocked) return blocked;

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    const includeEmbeddings = searchParams.get("embeddings") === "1";

    if (id) {
      const doc = await getRagDocument(id);
      if (!doc) {
        return NextResponse.json({ error: "Document not found" }, { status: 404 });
      }

      return NextResponse.json({
        document: {
          id: doc.id,
          filename: doc.filename,
          createdAt: doc.createdAt,
          charCount: doc.charCount,
          chunkCount: doc.chunkCount,
          embeddingModel: doc.embeddingModel,
          truncated: doc.truncated,
          textPreview: doc.textPreview,
          chunkMode: doc.chunkMode ?? "basic",
          windowSize: doc.windowSize,
          mergeThreshold: doc.mergeThreshold,
          parentChunkSize: doc.parentChunkSize,
          childChunkSize: doc.childChunkSize,
          parentCount: doc.parents?.length,
        },
        chunks: doc.chunks.map((c) => ({
          id: c.id,
          index: c.index,
          text: c.text,
          windowText: c.windowText,
          parentId: c.parentId,
          parentIndex: c.parentIndex,
          charStart: c.charStart,
          charEnd: c.charEnd,
          embeddingDims: c.embedding.length,
          ...(includeEmbeddings ? { embedding: c.embedding } : {}),
        })),
        parents: doc.parents?.map((p) => ({
          id: p.id,
          index: p.index,
          childCount: p.childIds.length,
          textPreview: p.text.slice(0, 220),
        })),
      });
    }

    const documents = await listRagDocuments();
    return NextResponse.json({ documents });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to list RAG docs";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const blocked = guardRequest(request);
  if (blocked) return blocked;

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }
    const ok = await deleteRagDocument(id);
    if (!ok) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }
    return NextResponse.json({ deleted: true, id });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to delete RAG doc";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
