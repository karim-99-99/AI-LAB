import type { AgentThread } from "@/lib/agent/memory";
import type { UsageInfo } from "@/lib/usage";

export type AgentStep = {
  n: number;
  type: "thought" | "tool_call" | "tool_result" | "final";
  name?: string;
  detail: string;
};

export type AgentApprovalRef = {
  approvalId: string;
  subject: string;
  to: string | null;
  approveUrl: string;
};

export type AgentEngine = "manual" | "langgraph";

/** Visible teaching diff — answer can look the same; this shows how it ran. */
export type AgentEngineInfo = {
  engine: AgentEngine;
  title: string;
  loop: string;
  memory: string;
  graph: string;
  whenItMatters: string;
  extras?: Record<string, string | number | boolean>;
};

export type AgentRunResult = {
  answer: string;
  steps: AgentStep[];
  usage: UsageInfo | null;
  model: string;
  threadId: string;
  memoryTurns: number;
  thread: Pick<AgentThread, "id" | "updatedAt" | "turns">;
  approvals: AgentApprovalRef[];
  engine: AgentEngine;
  engineInfo: AgentEngineInfo;
};
