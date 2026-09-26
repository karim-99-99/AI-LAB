import { NextResponse } from "next/server";
import { after } from "next/server";
import { guardRequest } from "@/lib/guard";
import { parseIngestMode, performRagIngest } from "@/lib/rag/ingest";
import {
  createIngestJob,
  updateIngestJob,
} from "@/lib/rag/jobs";

// Background work continues via after(); keep the function alive long enough.
export const maxDuration = 60;

/**
 * Phase 5 Step 3 — async ingest.
 * Returns a job id immediately; heavy work continues in the background.
 * (Local practice version of the Inngest idea — same pattern, no cloud account.)
 */
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

    const mode = parseIngestMode(String(form.get("mode") ?? "basic"));
    const options = {
      filename: file.name || "document.pdf",
      buffer: Buffer.from(await file.arrayBuffer()),
      mode,
      chunkSize: Number(form.get("chunkSize") ?? 800) || 800,
      overlap: Number(form.get("overlap") ?? 120) || 120,
      windowSize: Number(form.get("windowSize") ?? 3) || 3,
      parentSize: Number(form.get("parentSize") ?? 1600) || 1600,
      childSize: Number(form.get("childSize") ?? 400) || 400,
      mergeThreshold: Number(form.get("mergeThreshold") ?? 0.5) || 0.5,
    };

    const job = await createIngestJob({
      filename: options.filename,
      mode,
    });

    after(async () => {
      try {
        await updateIngestJob(job.id, {
          status: "running",
          progress: "Starting…",
        });
        const result = await performRagIngest({
          ...options,
          onProgress: async (message) => {
            await updateIngestJob(job.id, {
              status: "running",
              progress: message,
            });
          },
        });
        await updateIngestJob(job.id, {
          status: "done",
          progress: "Done",
          result,
        });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Async ingest failed";
        console.error("[/api/rag/ingest/async]", message);
        await updateIngestJob(job.id, {
          status: "failed",
          progress: "Failed",
          error: message,
        });
      }
    });

    return NextResponse.json({
      jobId: job.id,
      status: job.status,
      progress: job.progress,
      note: "Job queued. Poll GET /api/rag/jobs?id=… until status is done/failed.",
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Async ingest failed";
    console.error("[/api/rag/ingest/async]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
