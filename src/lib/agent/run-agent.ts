import type OpenAI from "openai";
import { getOpenAI } from "@/lib/openai";
import { getModelForTask } from "@/lib/model-router";
import { buildAndLogUsage } from "@/lib/usage-server";
import {
  appendTurns,
  getOrCreateThread,
  turnsForContext,
  type AgentTurn,
} from "@/lib/agent/memory";
import {
  toolDraftEmail,
  toolListDocuments,
  toolSearchDocs,
} from "@/lib/agent/tools";
import type {
  AgentApprovalRef,
  AgentRunResult,
  AgentStep,
} from "@/lib/agent/types";

export type { AgentApprovalRef, AgentEngine, AgentRunResult, AgentStep } from "@/lib/agent/types";

const TOOLS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "list_documents",
      description:
        "List uploaded company/PDF documents available in the RAG store.",
      parameters: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_docs",
      description:
        "Search ingested PDF/knowledge docs for relevant chunks. Use for company/policy questions.",
      parameters: {
        type: "object",
        properties: {
          question: {
            type: "string",
            description: "Search query / user question",
          },
          topK: { type: "number", description: "How many chunks (1-8)" },
        },
        required: ["question"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "draft_email",
      description:
        "Draft a short professional email and queue it for HUMAN approval at /approve. Does NOT send.",
      parameters: {
        type: "object",
        properties: {
          to: { type: "string" },
          subject: { type: "string" },
          body: { type: "string" },
        },
        required: ["subject", "body"],
        additionalProperties: false,
      },
    },
  },
];

async function runTool(
  name: string,
  argsJson: string,
  ctx: { threadId: string; approvals: AgentApprovalRef[] }
): Promise<string> {
  let args: Record<string, unknown> = {};
  try {
    args = JSON.parse(argsJson || "{}") as Record<string, unknown>;
  } catch {
    return JSON.stringify({ error: "Invalid tool arguments JSON" });
  }

  if (name === "list_documents") return toolListDocuments();

  if (name === "search_docs") {
    return toolSearchDocs(
      String(args.question ?? ""),
      Number(args.topK ?? 4)
    );
  }

  if (name === "draft_email") {
    return toolDraftEmail({
      to: args.to != null ? String(args.to) : null,
      subject: String(args.subject ?? ""),
      body: String(args.body ?? ""),
      threadId: ctx.threadId,
      approvals: ctx.approvals,
    });
  }

  return JSON.stringify({ error: `Unknown tool: ${name}` });
}

/**
 * Phase 6 — manual ReAct loop (no LangGraph package).
 * Same tools + JSON thread memory + HITL draft_email.
 */
export async function runResearchAgent(
  goal: string,
  options?: { maxSteps?: number; threadId?: string | null }
): Promise<AgentRunResult> {
  const maxSteps = options?.maxSteps ?? 6;
  const model = getModelForTask("agent_research");
  const client = getOpenAI();
  const steps: AgentStep[] = [];
  const approvals: AgentApprovalRef[] = [];
  let usage: AgentRunResult["usage"] = null;

  const thread = await getOrCreateThread(options?.threadId);
  const prior = turnsForContext(thread);
  const toolCtx = { threadId: thread.id, approvals };

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    {
      role: "system",
      content: `You are a careful company research agent for an AI Lab.
You have tools: list_documents, search_docs, draft_email.
Rules:
- Prefer search_docs for facts about uploaded PDFs.
- If docs are weak/empty, say you don't know — do not invent.
- Use draft_email when the user asks for an email. It queues human approval (does not send).
- Include a real "to" email if the user gave one.
- After tools, give a clear final answer. If you queued an email, mention the /approve link.
- Keep answers concise.
- You may receive prior turns from this thread — use them for follow-up questions.`,
    },
  ];

  for (const turn of prior) {
    messages.push({ role: turn.role, content: turn.content });
  }

  messages.push({ role: "user", content: goal });

  let answer =
    "Agent stopped after max steps without a final answer. Try a narrower goal.";

  for (let i = 0; i < maxSteps; i++) {
    const completion = await client.chat.completions.create({
      model,
      temperature: 0.2,
      tools: TOOLS,
      messages,
    });

    usage = buildAndLogUsage(model, completion.usage, {
      route: "/api/agent/run",
    });

    const msg = completion.choices[0]?.message;
    if (!msg) break;

    const toolCalls = msg.tool_calls ?? [];
    if (toolCalls.length === 0) {
      answer = (msg.content ?? "").trim() || "No answer produced.";
      steps.push({ n: steps.length + 1, type: "final", detail: answer });
      break;
    }

    messages.push({
      role: "assistant",
      content: msg.content ?? null,
      tool_calls: toolCalls,
    });

    for (const call of toolCalls) {
      if (call.type !== "function") continue;
      const name = call.function.name;
      const args = call.function.arguments ?? "{}";
      steps.push({
        n: steps.length + 1,
        type: "tool_call",
        name,
        detail: args,
      });
      const result = await runTool(name, args, toolCtx);
      steps.push({
        n: steps.length + 1,
        type: "tool_result",
        name,
        detail: result.slice(0, 2000),
      });
      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: result,
      });
    }
  }

  if (!steps.some((s) => s.type === "final")) {
    steps.push({ n: steps.length + 1, type: "final", detail: answer });
  }

  const toolsUsed = [
    ...new Set(
      steps.filter((s) => s.type === "tool_call" && s.name).map((s) => s.name!)
    ),
  ];
  const now = new Date().toISOString();
  const newTurns: AgentTurn[] = [
    { role: "user", content: goal, createdAt: now },
    {
      role: "assistant",
      content: answer,
      createdAt: now,
      toolsUsed,
    },
  ];
  const saved = await appendTurns(thread.id, newTurns);

  return {
    answer,
    steps,
    usage,
    model,
    threadId: saved.id,
    memoryTurns: prior.length,
    thread: {
      id: saved.id,
      updatedAt: saved.updatedAt,
      turns: saved.turns,
    },
    approvals,
    engine: "manual",
    engineInfo: {
      engine: "manual",
      title: "Manual ReAct (our for-loop)",
      loop: `Hand-written for-loop in run-agent.ts — max ${maxSteps} model rounds`,
      memory: `JSON file (data/agent-threads.json) — we inject last ${prior.length} turn(s) into the prompt`,
      graph: "No graph — just: model → tools → model → … → final",
      whenItMatters: "Fine for learning & simple agents. You own every line.",
      extras: {
        toolCalls: steps.filter((s) => s.type === "tool_call").length,
        priorTurnsInjected: prior.length,
        codePath: "src/lib/agent/run-agent.ts",
      },
    },
  };
}
