import { promises as fs } from "fs";
import path from "path";
import { newId } from "@/lib/store";
import { dataDir } from "@/lib/data-dir";

export type AgentTurn = {
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  /** Short step summary for UI (tool names used). */
  toolsUsed?: string[];
};

export type AgentThread = {
  id: string;
  createdAt: string;
  updatedAt: string;
  turns: AgentTurn[];
};

type ThreadStore = {
  threads: AgentThread[];
};

const EMPTY: ThreadStore = { threads: [] };
const MAX_TURNS_KEPT = 24;
const MAX_TURNS_IN_CONTEXT = 8;

function threadsPath() {
  return path.join(dataDir(), "agent-threads.json");
}

async function ensure(): Promise<void> {
  await fs.mkdir(dataDir(), { recursive: true });
  try {
    await fs.access(threadsPath());
  } catch {
    await fs.writeFile(threadsPath(), JSON.stringify(EMPTY, null, 2), "utf8");
  }
}

async function readAll(): Promise<ThreadStore> {
  await ensure();
  const raw = await fs.readFile(threadsPath(), "utf8");
  try {
    return { ...EMPTY, ...JSON.parse(raw) } as ThreadStore;
  } catch {
    return { ...EMPTY };
  }
}

async function writeAll(data: ThreadStore): Promise<void> {
  await ensure();
  await fs.writeFile(threadsPath(), JSON.stringify(data, null, 2), "utf8");
}

export function createThreadId(): string {
  return newId("thread");
}

export async function getThread(threadId: string): Promise<AgentThread | null> {
  const all = await readAll();
  return all.threads.find((t) => t.id === threadId) ?? null;
}

export async function getOrCreateThread(threadId?: string | null): Promise<AgentThread> {
  const all = await readAll();
  if (threadId) {
    const existing = all.threads.find((t) => t.id === threadId);
    if (existing) return existing;
  }
  const now = new Date().toISOString();
  const thread: AgentThread = {
    id: threadId?.trim() || createThreadId(),
    createdAt: now,
    updatedAt: now,
    turns: [],
  };
  all.threads.unshift(thread);
  await writeAll(all);
  return thread;
}

export async function appendTurns(
  threadId: string,
  turns: AgentTurn[]
): Promise<AgentThread> {
  const all = await readAll();
  let thread = all.threads.find((t) => t.id === threadId);
  if (!thread) {
    const now = new Date().toISOString();
    thread = { id: threadId, createdAt: now, updatedAt: now, turns: [] };
    all.threads.unshift(thread);
  }
  thread.turns.push(...turns);
  if (thread.turns.length > MAX_TURNS_KEPT) {
    thread.turns = thread.turns.slice(-MAX_TURNS_KEPT);
  }
  thread.updatedAt = new Date().toISOString();
  await writeAll(all);
  return thread;
}

/** Prior user/assistant turns to inject into the model (like LangGraph thread memory). */
export function turnsForContext(thread: AgentThread): AgentTurn[] {
  return thread.turns.slice(-MAX_TURNS_IN_CONTEXT);
}

export async function listRecentThreads(limit = 8): Promise<
  Pick<AgentThread, "id" | "createdAt" | "updatedAt">[]
> {
  const all = await readAll();
  return all.threads
    .slice()
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, limit)
    .map((t) => ({
      id: t.id,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    }));
}
