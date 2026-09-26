import { NextResponse } from "next/server";

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

const WINDOW_MS = 60_000;
const MAX_REQUESTS = Number(process.env.RATE_LIMIT_PER_MIN ?? "10");

/**
 * Simple in-memory rate limiter (per process).
 * Key = practice key + caller IP, so visitors of the public demo don't share
 * one bucket (the browser key is public via NEXT_PUBLIC_PRACTICE_API_KEY).
 */
export function assertRateLimit(
  request: Request,
  identity?: string | null
): NextResponse | null {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "local";
  const who = identity || request.headers.get("x-practice-key") || "anon";
  const key = `${who}:${ip}`;

  const now = Date.now();
  let bucket = buckets.get(key);

  if (!bucket || now >= bucket.resetAt) {
    bucket = { count: 0, resetAt: now + WINDOW_MS };
    buckets.set(key, bucket);
  }

  bucket.count += 1;

  if (bucket.count > MAX_REQUESTS) {
    const retryAfterSec = Math.max(
      1,
      Math.ceil((bucket.resetAt - now) / 1000)
    );
    return NextResponse.json(
      {
        error: `Rate limit exceeded (${MAX_REQUESTS}/min). Try again in ${retryAfterSec}s.`,
      },
      {
        status: 429,
        headers: { "Retry-After": String(retryAfterSec) },
      }
    );
  }

  return null;
}
