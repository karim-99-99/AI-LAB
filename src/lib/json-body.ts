import { NextResponse } from "next/server";

/**
 * Read a JSON object body.
 * A SyntaxError here means the caller sent malformed JSON (often broken
 * shell quoting). It is not evidence that a document store was restored.
 */
export async function readJsonBody(
  request: Request
): Promise<
  | { ok: true; body: Record<string, unknown> }
  | { ok: false; response: NextResponse }
> {
  try {
    const value = await request.json();
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return {
        ok: false,
        response: NextResponse.json(
          { error: "Request body must be a JSON object." },
          { status: 400 }
        ),
      };
    }
    return { ok: true, body: value as Record<string, unknown> };
  } catch (error) {
    if (error instanceof SyntaxError) {
      return {
        ok: false,
        response: NextResponse.json(
          {
            error:
              "Request body is not valid JSON. Check quoting and Content-Type: application/json.",
          },
          { status: 400 }
        ),
      };
    }
    throw error;
  }
}
