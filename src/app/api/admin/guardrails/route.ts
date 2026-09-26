import { NextResponse } from "next/server";
import { guardRequest } from "@/lib/guard";
import { describeGuardrails } from "@/lib/guardrails";

/** Phase 7 — show active guardrail settings on /admin. */
export async function GET(request: Request) {
  const blocked = guardRequest(request);
  if (blocked) return blocked;

  return NextResponse.json({
    note: "Practice guardrails: injection patterns, blocked topics, size limits.",
    ...describeGuardrails(),
    owaspSkim: "https://owasp.org/www-project-top-10-for-large-language-model-applications/",
  });
}
