import { NextResponse } from "next/server";
import { guardRequest } from "@/lib/guard";
import { parseIngestMode, performRagIngest } from "@/lib/rag/ingest";

// PDF parse + local embeddings (first call downloads the model) — allow longer.
export const maxDuration = 60;

export async function POST(request: Request) {
  const blocked = guardRequest(request);
  if (blocked) return blocked;

  try {
    const contentType = request.headers.get("content-type") || "";
    if (!contentType.includes("multipart/form-data")) {
      return NextResponse.json(
        { error: "Expected multipart/form-data with a PDF file" },
        { status: 400 }
      );
    }

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "file is required" }, { status: 400 });
    }
    if (file.size > 8 * 1024 * 1024) {
      return NextResponse.json(
        { error: "PDF must be under 8MB for local practice" },
        { status: 400 }
      );
    }

    const result = await performRagIngest({
      filename: file.name || "document.pdf",
      buffer: Buffer.from(await file.arrayBuffer()),
      mode: parseIngestMode(String(form.get("mode") ?? "basic")),
      chunkSize: Number(form.get("chunkSize") ?? 800) || 800,
      overlap: Number(form.get("overlap") ?? 120) || 120,
      windowSize: Number(form.get("windowSize") ?? 3) || 3,
      parentSize: Number(form.get("parentSize") ?? 1600) || 1600,
      childSize: Number(form.get("childSize") ?? 400) || 400,
      mergeThreshold: Number(form.get("mergeThreshold") ?? 0.5) || 0.5,
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "RAG ingest failed";
    console.error("[/api/rag/ingest]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
