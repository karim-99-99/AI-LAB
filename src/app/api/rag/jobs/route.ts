import { NextResponse } from "next/server";
import { guardRequest } from "@/lib/guard";
import { getIngestJob, listIngestJobs } from "@/lib/rag/jobs";

export async function GET(request: Request) {
  const blocked = guardRequest(request);
  if (blocked) return blocked;

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (id) {
      const job = await getIngestJob(id);
      if (!job) {
        return NextResponse.json({ error: "Job not found" }, { status: 404 });
      }
      return NextResponse.json({ job });
    }
    const jobs = await listIngestJobs(20);
    return NextResponse.json({ jobs });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load jobs";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
