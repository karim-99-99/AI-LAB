import { NextResponse } from "next/server";
import { assertPracticeAuth, extractPracticeKey } from "./auth";
import { assertRateLimit } from "./rate-limit";

/** Auth + rate limit for AI / automation routes. */
export function guardRequest(request: Request): NextResponse | null {
  const authError = assertPracticeAuth(request);
  if (authError) return authError;

  const rateError = assertRateLimit(request, extractPracticeKey(request));
  if (rateError) return rateError;

  return null;
}
