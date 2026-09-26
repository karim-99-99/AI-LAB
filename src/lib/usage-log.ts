import { promises as fs } from "fs";
import path from "path";
import type { UsageInfo } from "./usage";
import { dataDir } from "./data-dir";

export type UsageEvent = UsageInfo & {
  id: string;
  createdAt: string;
  route: string;
  ok: boolean;
  latencyMs?: number;
  requestId?: string;
};

type UsageLogFile = {
  events: UsageEvent[];
};

function logPath() {
  return dataDir("usage-log.json");
}

async function ensure() {
  await fs.mkdir(dataDir(), { recursive: true });
  try {
    await fs.access(logPath());
  } catch {
    const empty: UsageLogFile = { events: [] };
    await fs.writeFile(logPath(), JSON.stringify(empty, null, 2), "utf8");
  }
}

async function readLog(): Promise<UsageLogFile> {
  await ensure();
  try {
    const raw = await fs.readFile(logPath(), "utf8");
    const parsed = JSON.parse(raw) as UsageLogFile;
    return { events: parsed.events ?? [] };
  } catch {
    return { events: [] };
  }
}

export async function appendUsageEvent(
  info: UsageInfo,
  meta: {
    route: string;
    ok?: boolean;
    latencyMs?: number;
    requestId?: string;
  }
): Promise<UsageEvent> {
  const log = await readLog();
  const event: UsageEvent = {
    id: `u_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    route: meta.route,
    ok: meta.ok ?? true,
    latencyMs: meta.latencyMs,
    requestId: meta.requestId,
    ...info,
  };
  log.events = [event, ...log.events].slice(0, 500);
  await fs.writeFile(logPath(), JSON.stringify(log, null, 2), "utf8");
  return event;
}

export async function listUsageEvents(limit = 100): Promise<UsageEvent[]> {
  const log = await readLog();
  return log.events.slice(0, limit);
}

export async function summarizeUsage(limit = 500) {
  const events = (await readLog()).events.slice(0, limit);
  const totalRequests = events.length;
  const totalTokens = events.reduce((s, e) => s + e.totalTokens, 0);
  const totalCost = events.reduce((s, e) => s + e.estimatedCostUsd, 0);
  const errors = events.filter((e) => !e.ok).length;
  const byRoute = new Map<string, number>();
  const byModel = new Map<string, number>();
  for (const e of events) {
    byRoute.set(e.route, (byRoute.get(e.route) ?? 0) + 1);
    byModel.set(e.model, (byModel.get(e.model) ?? 0) + 1);
  }
  return {
    totalRequests,
    totalTokens,
    totalCostUsd: Number(totalCost.toFixed(8)),
    errors,
    byRoute: [...byRoute.entries()]
      .map(([route, count]) => ({ route, count }))
      .sort((a, b) => b.count - a.count),
    byModel: [...byModel.entries()]
      .map(([model, count]) => ({ model, count }))
      .sort((a, b) => b.count - a.count),
    recent: events.slice(0, 40),
  };
}
