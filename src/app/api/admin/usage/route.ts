import { NextResponse } from "next/server";
import { guardRequest } from "@/lib/guard";
import { summarizeUsage } from "@/lib/usage-log";

export async function GET(request: Request) {
  const blocked = guardRequest(request);
  if (blocked) return blocked;

  try {
    const summary = await summarizeUsage(500);
    return NextResponse.json(summary);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load usage summary";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
