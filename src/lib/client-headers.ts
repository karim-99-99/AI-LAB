/**
 * Client-side headers for practice API calls.
 * Prefer NEXT_PUBLIC_PRACTICE_API_KEY so the UI can call protected routes.
 */
export function practiceHeaders(
  extra?: HeadersInit
): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (extra) {
    const init = new Headers(extra);
    init.forEach((value, key) => {
      headers[key] = value;
    });
  }

  const key =
    typeof process !== "undefined"
      ? process.env.NEXT_PUBLIC_PRACTICE_API_KEY?.trim()
      : undefined;

  if (key) {
    headers["x-practice-key"] = key;
  }

  return headers;
}
