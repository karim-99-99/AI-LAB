import { promises as fs } from "fs";
import path from "path";
import type { IngestResult } from "./ingest";
import { dataDir } from "@/lib/data-dir";

export type JobStatus = "queued" | "running" | "done" | "failed";

export type IngestJob = {
  id: string;
  createdAt: string;
  updatedAt: string;
  status: JobStatus;
  progress: string;
  filename: string;
  mode: string;
  error?: string;
  result?: IngestResult;
};

type JobFile = { jobs: IngestJob[] };

function jobsPath() {
  return dataDir("rag", "jobs.json");
}

async function ensure() {
  await fs.mkdir(path.dirname(jobsPath()), { recursive: true });
  try {
    await fs.access(jobsPath());
  } catch {
    await fs.writeFile(jobsPath(), JSON.stringify({ jobs: [] }, null, 2), "utf8");
  }
}

async function readJobs(): Promise<JobFile> {
  await ensure();
  try {
    const raw = await fs.readFile(jobsPath(), "utf8");
    const parsed = JSON.parse(raw) as JobFile;
    return { jobs: parsed.jobs ?? [] };
  } catch {
    return { jobs: [] };
  }
}

async function writeJobs(file: JobFile) {
  await ensure();
  await fs.writeFile(jobsPath(), JSON.stringify(file, null, 2), "utf8");
}

export async function createIngestJob(meta: {
  filename: string;
  mode: string;
}): Promise<IngestJob> {
  const file = await readJobs();
  const job: IngestJob = {
    id: `job_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: "queued",
    progress: "Queued…",
    filename: meta.filename,
    mode: meta.mode,
  };
  file.jobs = [job, ...file.jobs].slice(0, 50);
  await writeJobs(file);
  return job;
}

export async function updateIngestJob(
  id: string,
  patch: Partial<IngestJob>
): Promise<IngestJob | null> {
  const file = await readJobs();
  const idx = file.jobs.findIndex((j) => j.id === id);
  if (idx < 0) return null;
  const next = {
    ...file.jobs[idx]!,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  file.jobs[idx] = next;
  await writeJobs(file);
  return next;
}

export async function getIngestJob(id: string): Promise<IngestJob | null> {
  const file = await readJobs();
  return file.jobs.find((j) => j.id === id) ?? null;
}

export async function listIngestJobs(limit = 20): Promise<IngestJob[]> {
  const file = await readJobs();
  return file.jobs.slice(0, limit);
}
