import { NextResponse } from "next/server";
import { guardRequest } from "@/lib/guard";
import { runResearchAgent } from "@/lib/agent/run-agent";
import { runResearchAgentLangGraph } from "@/lib/agent/run-agent-langgraph";
import { createThreadId, getThread, listRecentThreads } from "@/lib/agent/memory";
import type { AgentEngine } from "@/lib/agent/types";
import { guardUserInput, newRequestId } from "@/lib/guardrails";

// Multi-step agent (several LLM calls + tools) — allow longer than the default.
export const maxDuration = 60;

export async function GET(request: Request) {
  const blocked = guardRequest(request);
  if (blocked) return blocked;

  const url = new URL(request.url);
  const threadId = url.searchParams.get("threadId")?.trim();

  if (threadId) {
    const thread = await getThread(threadId);
    if (!thread) {
      return NextResponse.json({ error: "thread not found" }, { status: 404 });
    }
    return NextResponse.json({ thread });
  }

  const threads = await listRecentThreads(8);
  return NextResponse.json({
    threads,
    newThreadId: createThreadId(),
    engines: ["langgraph", "manual"],
    note: "Default engine is langgraph (createReactAgent + MemorySaver).",
  });
}

export async function POST(request: Request) {
  const blocked = guardRequest(request);
  if (blocked) return blocked;

  const requestId = newRequestId();

  try {
    const body = await request.json();
    const gated = guardUserInput(String(body.goal ?? body.question ?? ""), {
      field: "goal",
    });
    if (!gated.ok) {
      return NextResponse.json(
        { error: gated.error, guardrails: gated.hits, requestId },
        { status: 400 }
      );
    }
    const goal = gated.cleaned;
    const maxSteps = Number(body.maxSteps ?? 6);
    const threadId =
      typeof body.threadId === "string" && body.threadId.trim()
        ? body.threadId.trim()
        : null;
    const engineRaw = String(body.engine ?? "langgraph").toLowerCase();
    const engine: AgentEngine =
      engineRaw === "manual" ? "manual" : "langgraph";

    const opts = {
      maxSteps: Number.isFinite(maxSteps) ? Math.min(10, maxSteps) : 6,
      threadId,
    };

    const result =
      engine === "langgraph"
        ? await runResearchAgentLangGraph(goal, opts)
        : await runResearchAgent(goal, opts);

    return NextResponse.json({
      ...result,
      requestId,
      guardWarnings: gated.warnings,
      note:
        result.engine === "langgraph"
          ? result.approvals.length > 0
            ? `LangGraph agent queued ${result.approvals.length} draft(s) for /approve.`
            : "LangGraph createReactAgent + MemorySaver (thread_id)."
          : result.approvals.length > 0
            ? `Manual ReAct queued ${result.approvals.length} draft(s) for /approve.`
            : "Manual ReAct loop (same tools, no LangGraph package).",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Agent failed";
    console.error("[/api/agent/run]", requestId, message);
    return NextResponse.json({ error: message, requestId }, { status: 500 });
  }
}
