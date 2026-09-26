import { NextResponse } from "next/server";

/**
 * Practice auth: shared secret via header or cookie.
 * - Header: x-practice-key: <PRACTICE_API_KEY>
 * - Cookie: practice_key=<PRACTICE_API_KEY>
 * - Authorization: Bearer <PRACTICE_API_KEY>
 *
 * If PRACTICE_API_KEY is unset, routes stay open (local-only practice).
 */
export function getExpectedPracticeKey(): string | null {
  const key = process.env.PRACTICE_API_KEY?.trim();
  return key || null;
}

export function extractPracticeKey(request: Request): string | null {
  const header = request.headers.get("x-practice-key")?.trim();
  if (header) return header;

  const auth = request.headers.get("authorization")?.trim();
  if (auth?.toLowerCase().startsWith("bearer ")) {
    return auth.slice(7).trim();
  }

  const cookie = request.headers.get("cookie") ?? "";
  const match = cookie.match(/(?:^|;\s*)practice_key=([^;]+)/);
  if (match?.[1]) {
    return decodeURIComponent(match[1].trim());
  }

  return null;
}

export function assertPracticeAuth(
  request: Request
): NextResponse | null {
  const expected = getExpectedPracticeKey();
  if (!expected) return null;

  const provided = extractPracticeKey(request);
  if (provided === expected) return null;

  return NextResponse.json(
    {
      error:
        "Unauthorized. Send header x-practice-key or Authorization: Bearer <PRACTICE_API_KEY>.",
    },
    { status: 401 }
  );
}
