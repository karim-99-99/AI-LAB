import { getProvider } from "./openai";

/**
 * Phase 5 Step 5 — model routing.
 *
 * We do NOT ask an AI “which model?”. We map each *route/task* to a tier
 * using simple product rules (speed/cost vs quality/reliability).
 */

export type ModelTier = "fast" | "strong";

export type AiTask =
  | "chat"
  | "grammar"
  | "summarize"
  | "email"
  | "blog"
  | "pdf_summarize"
  | "resume"
  | "extract"
  | "rag_answer"
  | "rag_eval_judge"
  | "automation_support"
  | "automation_email"
  | "automation_meeting"
  | "automation_crm"
  | "automation_channel"
  | "agent_research";

/**
 * Rule table: what kind of work needs which tier.
 *
 * fast  = short, rewrite, classify, light chat
 * strong = long context, JSON schemas, RAG answers, high-stakes drafts
 */
const TASK_TIER: Record<AiTask, ModelTier> = {
  chat: "fast",
  grammar: "fast",
  summarize: "fast",
  email: "fast",
  blog: "strong",
  pdf_summarize: "strong",
  resume: "strong",
  extract: "strong",
  rag_answer: "strong",
  rag_eval_judge: "fast",
  automation_support: "strong",
  automation_email: "fast",
  automation_meeting: "strong",
  automation_crm: "strong",
  automation_channel: "fast",
  agent_research: "strong",
};

function defaultFastModel(): string {
  return getProvider() === "openai" ? "gpt-4o-mini" : "openai/gpt-oss-20b";
}

function defaultStrongModel(): string {
  return getProvider() === "openai" ? "gpt-4o" : "openai/gpt-oss-120b";
}

export function getTierForTask(task: AiTask): ModelTier {
  return TASK_TIER[task];
}

/**
 * Pick model for a known task.
 * Env overrides:
 * - AI_MODEL_FAST / AI_MODEL_STRONG
 * - AI_MODEL (legacy) forces one model for everything if set alone —
 *   still allow FAST/STRONG to win when present.
 */
export function getModelForTask(task: AiTask): string {
  const tier = getTierForTask(task);

  if (tier === "strong") {
    return (
      process.env.AI_MODEL_STRONG?.trim() ||
      process.env.AI_MODEL?.trim() ||
      defaultStrongModel()
    );
  }

  return (
    process.env.AI_MODEL_FAST?.trim() ||
    process.env.AI_MODEL?.trim() ||
    defaultFastModel()
  );
}

export function describeRouting(): {
  task: AiTask;
  tier: ModelTier;
  model: string;
}[] {
  return (Object.keys(TASK_TIER) as AiTask[]).map((task) => ({
    task,
    tier: getTierForTask(task),
    model: getModelForTask(task),
  }));
}
