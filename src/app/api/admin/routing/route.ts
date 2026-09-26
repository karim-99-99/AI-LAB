import { NextResponse } from "next/server";
import { guardRequest } from "@/lib/guard";
import { describeRouting } from "@/lib/model-router";

/** Phase 5 Step 5 — inspect which task uses which model. */
export async function GET(request: Request) {
  const blocked = guardRequest(request);
  if (blocked) return blocked;

  return NextResponse.json({
    note: "Routing is a fixed task→tier table (not an AI deciding live).",
    tiers: {
      fast: "cheap/quick — rewrite, grammar, light chat, simple classify",
      strong:
        "better quality — RAG answers, JSON extract, resume, long drafts",
    },
    routes: describeRouting(),
  });
}
