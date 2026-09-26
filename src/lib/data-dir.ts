import os from "os";
import path from "path";

/**
 * Where JSON stores (store.json, usage-log.json, rag/*, agent-threads.json) live.
 *
 * - Local dev: `<project>/data` (git-ignored).
 * - Vercel / serverless: the project folder is read-only, so we use the OS temp
 *   dir. This is EPHEMERAL — it survives warm invocations but resets on cold
 *   starts / new deployments. Good enough for a live demo; for real persistence
 *   set DATA_DIR to a mounted volume or swap the stores for Upstash/Supabase.
 * - Override anywhere with DATA_DIR=/absolute/path.
 */
export function dataDir(...segments: string[]): string {
  const override = process.env.DATA_DIR?.trim();
  const base = override
    ? override
    : process.env.VERCEL
      ? path.join(os.tmpdir(), "ai-lab-data")
      : path.join(process.cwd(), "data");
  return path.join(base, ...segments);
}

/** True when writes will not survive cold starts (serverless without DATA_DIR). */
export function isEphemeralStorage(): boolean {
  return Boolean(process.env.VERCEL) && !process.env.DATA_DIR?.trim();
}
