import { ChatOpenAI } from "@langchain/openai";
import { tool } from "@langchain/core/tools";
import {
  HumanMessage,
  isAIMessage,
  isToolMessage,
  type BaseMessage,
} from "@langchain/core/messages";
import { z } from "zod";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { MemorySaver } from "@langchain/langgraph";
import { getProvider } from "@/lib/openai";
import { getModelForTask } from "@/lib/model-router";
import { buildAndLogUsage } from "@/lib/usage-server";
import type { UsageInfo } from "@/lib/usage";
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

const SYSTEM_PROMPT = `You are a careful company research agent for an AI Lab.
You have tools: list_documents, search_docs, draft_email.
Rules:
- Prefer search_docs for facts about uploaded PDFs.
- If docs are weak/empty, say you don't know — do not invent.
- Use draft_email when the user asks for an email. It queues human approval (does not send).
- Include a real "to" email if the user gave one.
- After tools, give a clear final answer. If you queued an email, mention the /approve link.
- Keep answers concise.`;

type RunContext = {
  threadId: string;
  approvals: AgentApprovalRef[];
};

/** AsyncLocal-ish context so LangChain tools can see the active thread. */
let activeCtx: RunContext | null = null;

function getChatModel(model: string) {
  const provider = getProvider();
  if (provider === "groq") {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) throw new Error("Missing GROQ_API_KEY in .env.local");
    return new ChatOpenAI({
      model,
      temperature: 0.2,
      apiKey,
      configuration: { baseURL: "https://api.groq.com/openai/v1" },
    });
  }
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY in .env.local");
  return new ChatOpenAI({ model, temperature: 0.2, apiKey });
}

function buildTools() {
  const listDocuments = tool(
    async () => toolListDocuments(),
    {
      name: "list_documents",
      description:
        "List uploaded company/PDF documents available in the RAG store.",
      schema: z.object({}),
    }
  );

  const searchDocs = tool(
    async (input: { question: string; topK?: number }) =>
      toolSearchDocs(input.question, input.topK ?? 4),
    {
      name: "search_docs",
      description:
        "Search ingested PDF/knowledge docs for relevant chunks. Use for company/policy questions.",
      schema: z.object({
        question: z.string().describe("Search query / user question"),
        topK: z.number().optional().describe("How many chunks (1-8)"),
      }),
    }
  );

  const draftEmail = tool(
    async (input: { to?: string; subject: string; body: string }) => {
      if (!activeCtx) {
        return JSON.stringify({ error: "No active agent context" });
      }
      return toolDraftEmail({
        to: input.to,
        subject: input.subject,
        body: input.body,
        threadId: activeCtx.threadId,
        approvals: activeCtx.approvals,
      });
    },
    {
      name: "draft_email",
      description:
        "Draft a short professional email and queue it for HUMAN approval at /approve. Does NOT send.",
      schema: z.object({
        to: z
          .string()
          .optional()
          .describe("Recipient email (needed for real Gmail send on approve)"),
        subject: z.string(),
        body: z.string(),
      }),
    }
  );

  return [listDocuments, searchDocs, draftEmail];
}

/** Process-local checkpointer (LangGraph MemorySaver) — same idea as course. */
const checkpointer = new MemorySaver();
let agentSingleton: ReturnType<typeof createReactAgent> | null = null;
let agentModelName: string | null = null;

function getAgent(model: string) {
  if (agentSingleton && agentModelName === model) return agentSingleton;
  agentSingleton = createReactAgent({
    llm: getChatModel(model),
    tools: buildTools(),
    checkpointSaver: checkpointer,
    prompt: SYSTEM_PROMPT,
  });
  agentModelName = model;
  return agentSingleton;
}

function messageContentToString(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part === "object" && "text" in part) {
          return String((part as { text?: string }).text ?? "");
        }
        return "";
      })
      .join("")
      .trim();
  }
  return content == null ? "" : String(content);
}

function stepsFromMessages(messages: unknown[]): AgentStep[] {
  const steps: AgentStep[] = [];
  for (const raw of messages) {
    const msg = raw as BaseMessage;
    if (isAIMessage(msg)) {
      const calls = msg.tool_calls ?? [];
      if (calls.length > 0) {
        for (const call of calls) {
          steps.push({
            n: steps.length + 1,
            type: "tool_call",
            name: call.name,
            detail: JSON.stringify(call.args ?? {}),
          });
        }
      } else {
        const text = messageContentToString(msg.content).trim();
        if (text) {
          steps.push({
            n: steps.length + 1,
            type: "final",
            detail: text,
          });
        }
      }
    } else if (isToolMessage(msg)) {
      steps.push({
        n: steps.length + 1,
        type: "tool_result",
        name: msg.name ?? "tool",
        detail: messageContentToString(msg.content).slice(0, 2000),
      });
    }
  }
  return steps;
}

/**
 * Phase 6 — same research agent, implemented with LangGraph createReactAgent
 * + MemorySaver (thread_id), same RAG tools + HITL draft_email.
 */
export async function runResearchAgentLangGraph(
  goal: string,
  options?: { maxSteps?: number; threadId?: string | null }
): Promise<AgentRunResult> {
  const maxSteps = options?.maxSteps ?? 6;
  const model = getModelForTask("agent_research");
  const approvals: AgentApprovalRef[] = [];
  let usage: UsageInfo | null = null;

  const thread = await getOrCreateThread(options?.threadId);
  const prior = turnsForContext(thread);
  activeCtx = { threadId: thread.id, approvals };

  try {
    const agent = getAgent(model);

    // MemorySaver owns thread history via configurable.thread_id (course pattern).
    // We only send the new user goal; JSON memory is for the UI panel.
    const result = await agent.invoke(
      { messages: [new HumanMessage(goal)] },
      {
        configurable: { thread_id: thread.id },
        recursionLimit: Math.max(8, maxSteps * 3),
      }
    );

    const messages = (result.messages ?? []) as unknown[];
    const checkpointMessageCount = messages.length;
    const steps = stepsFromMessages(messages);
    const trimmedSteps = trimStepsToLatestRun(steps);

    const finalStep = [...trimmedSteps].reverse().find((s) => s.type === "final");
    const answer =
      finalStep?.detail?.trim() ||
      "Agent finished without a text answer. Check tool results.";

    if (!trimmedSteps.some((s) => s.type === "final")) {
      trimmedSteps.push({
        n: trimmedSteps.length + 1,
        type: "final",
        detail: answer,
      });
    }

    // Best-effort usage from last AI message metadata
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i] as BaseMessage;
      if (isAIMessage(msg) && msg.usage_metadata) {
        const u = msg.usage_metadata;
        usage = buildAndLogUsage(
          model,
          {
            prompt_tokens: u.input_tokens,
            completion_tokens: u.output_tokens,
            total_tokens: u.total_tokens,
          },
          { route: "/api/agent/run?engine=langgraph" }
        );
        break;
      }
    }

    const toolsUsed = [
      ...new Set(
        trimmedSteps
          .filter((s) => s.type === "tool_call" && s.name)
          .map((s) => s.name!)
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
      steps: trimmedSteps,
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
      engine: "langgraph",
      engineInfo: {
        engine: "langgraph",
        title: "LangGraph createReactAgent",
        loop: "Package graph: agent node ↔ tools node (library owns the loop)",
        memory: `MemorySaver checkpointer — configurable.thread_id="${thread.id}" (process RAM; survives turns until server restart)`,
        graph: "START → agent ⇄ tools → END (prebuilt ReAct graph)",
        whenItMatters:
          "Needed when you want branching, interrupt/HITL mid-graph, durable resume, multi-agent — not for a different final answer on the same tools.",
        extras: {
          checkpointMessages: checkpointMessageCount,
          toolCalls: trimmedSteps.filter((s) => s.type === "tool_call").length,
          recursionLimit: Math.max(8, maxSteps * 3),
          codePath: "src/lib/agent/run-agent-langgraph.ts",
        },
      },
    };
  } finally {
    activeCtx = null;
  }
}

function trimStepsToLatestRun(steps: AgentStep[]): AgentStep[] {
  // MemorySaver returns full thread history — show only the latest run.
  if (steps.length <= 12) return steps;
  const finals = steps
    .map((s, i) => (s.type === "final" ? i : -1))
    .filter((i) => i >= 0);
  if (finals.length === 0) return steps.slice(-10);
  const lastFinal = finals[finals.length - 1]!;
  const prevFinal = finals.length > 1 ? finals[finals.length - 2]! : -1;
  return steps.slice(prevFinal + 1, lastFinal + 1).map((s, i) => ({
    ...s,
    n: i + 1,
  }));
}
