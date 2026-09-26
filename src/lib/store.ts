import { promises as fs } from "fs";
import path from "path";
import { dataDir } from "./data-dir";

export type ConversationMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

export type Conversation = {
  id: string;
  createdAt: string;
  updatedAt: string;
  messages: ConversationMessage[];
};

export type ExtractedRecord = {
  id: string;
  createdAt: string;
  type: "invoice" | "form";
  data: Record<string, unknown>;
  rawTextPreview: string;
};

export type OutboxItem = {
  id: string;
  createdAt: string;
  channel: "email" | "slack" | "whatsapp";
  to: string;
  subject?: string;
  body: string;
  status: "draft" | "sent" | "rejected";
  meta?: Record<string, unknown>;
};

export type CrmRow = {
  id: string;
  createdAt: string;
  name: string;
  email?: string;
  company?: string;
  notes?: string;
  source: string;
  data?: Record<string, unknown>;
};

export type ApprovalItem = {
  id: string;
  createdAt: string;
  updatedAt: string;
  kind: "support" | "email" | "channel" | "agent";
  status: "pending" | "approved" | "rejected";
  title: string;
  draft: {
    to?: string;
    subject?: string;
    body: string;
    channel?: string;
  };
  context?: Record<string, unknown>;
  runId?: string;
};

export type AutomationRun = {
  id: string;
  createdAt: string;
  workflow: string;
  status: "ok" | "error" | "pending_approval";
  tokens?: number;
  error?: string;
  inputPreview?: string;
  resultPreview?: string;
  idempotencyKey?: string;
};

export type ChannelMessage = {
  id: string;
  createdAt: string;
  channel: "slack" | "whatsapp";
  user: string;
  text: string;
  reply?: string;
};

export type MeetingRecord = {
  id: string;
  createdAt: string;
  summary: string;
  tasks: string[];
  transcriptPreview: string;
};

type StoreData = {
  conversations: Conversation[];
  extractions: ExtractedRecord[];
  outbox: OutboxItem[];
  crm: CrmRow[];
  approvals: ApprovalItem[];
  automation_runs: AutomationRun[];
  channel_messages: ChannelMessage[];
  meetings: MeetingRecord[];
  idempotency: Record<string, { createdAt: string; response: unknown }>;
};

const EMPTY: StoreData = {
  conversations: [],
  extractions: [],
  outbox: [],
  crm: [],
  approvals: [],
  automation_runs: [],
  channel_messages: [],
  meetings: [],
  idempotency: {},
};

function storePath() {
  return path.join(dataDir(), "store.json");
}

async function ensureStore(): Promise<void> {
  await fs.mkdir(dataDir(), { recursive: true });
  try {
    await fs.access(storePath());
  } catch {
    await fs.writeFile(storePath(), JSON.stringify(EMPTY, null, 2), "utf8");
  }
}

export async function readStore(): Promise<StoreData> {
  await ensureStore();
  const raw = await fs.readFile(storePath(), "utf8");
  try {
    return { ...EMPTY, ...JSON.parse(raw) } as StoreData;
  } catch {
    return { ...EMPTY };
  }
}

export async function writeStore(data: StoreData): Promise<void> {
  await ensureStore();
  await fs.writeFile(storePath(), JSON.stringify(data, null, 2), "utf8");
}

export async function updateStore(
  mutator: (data: StoreData) => void | Promise<void>
): Promise<StoreData> {
  const data = await readStore();
  await mutator(data);
  await writeStore(data);
  return data;
}

export function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
