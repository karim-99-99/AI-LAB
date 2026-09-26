/**
 * Phase 7 Step 1 — LLM guardrails (practice-level).
 * Not perfect security — teaches OWASP-style defenses: input checks,
 * size limits, blocked topics, light output scrubbing.
 */

export type GuardrailHit = {
  code: string;
  message: string;
};

export type GuardrailResult =
  | { ok: true; cleaned: string; warnings: GuardrailHit[] }
  | { ok: false; error: string; hits: GuardrailHit[] };

const MAX_INPUT_CHARS = Number(process.env.GUARD_MAX_INPUT_CHARS ?? 12_000);
const MAX_OUTPUT_CHARS = Number(process.env.GUARD_MAX_OUTPUT_CHARS ?? 8_000);

/** Default blocked topics (comma-override via GUARD_BLOCKED_TOPICS). */
function blockedTopics(): string[] {
  const raw =
    process.env.GUARD_BLOCKED_TOPICS?.trim() ||
    "how to make a bomb, child sexual, credit card dump";
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

const INJECTION_PATTERNS: { code: string; re: RegExp; message: string }[] = [
  {
    code: "ignore_instructions",
    re: /ignore\s+(all\s+)?(previous|prior|above)\s+(instructions|prompts|rules)/i,
    message: "Blocked: attempt to override system instructions.",
  },
  {
    code: "reveal_system",
    re: /(reveal|show|print|dump)\s+(your\s+)?(system\s+prompt|hidden\s+prompt|instructions)/i,
    message: "Blocked: attempt to extract system prompt.",
  },
  {
    code: "dan_jailbreak",
    re: /\b(DAN\s+mode|jailbreak|developer\s+mode\s+enabled)\b/i,
    message: "Blocked: jailbreak-style prompt.",
  },
  {
    code: "role_hijack",
    re: /^(system|assistant)\s*:/im,
    message: "Blocked: forged system/assistant role in user text.",
  },
];

/**
 * Max completion tokens for chat-style calls (env override).
 * Used by routes that pass max_tokens to the provider.
 */
export function getMaxOutputTokens(defaultTokens = 1024): number {
  const n = Number(process.env.GUARD_MAX_OUTPUT_TOKENS ?? defaultTokens);
  if (!Number.isFinite(n) || n < 64) return defaultTokens;
  return Math.min(4096, Math.floor(n));
}

/** New request id for logs / client correlation. */
export function newRequestId(): string {
  return `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Sanitize + validate user text before it reaches the model.
 */
export function guardUserInput(
  text: string,
  options?: { field?: string; allowEmpty?: boolean }
): GuardrailResult {
  const field = options?.field ?? "input";
  const cleaned = String(text ?? "").trim();
  const warnings: GuardrailHit[] = [];
  const hits: GuardrailHit[] = [];

  if (!cleaned && !options?.allowEmpty) {
    return {
      ok: false,
      error: `${field} is required`,
      hits: [{ code: "empty", message: `${field} is empty` }],
    };
  }

  if (cleaned.length > MAX_INPUT_CHARS) {
    return {
      ok: false,
      error: `${field} too long (max ${MAX_INPUT_CHARS} chars).`,
      hits: [
        {
          code: "input_too_long",
          message: `Length ${cleaned.length} > ${MAX_INPUT_CHARS}`,
        },
      ],
    };
  }

  for (const p of INJECTION_PATTERNS) {
    if (p.re.test(cleaned)) {
      hits.push({ code: p.code, message: p.message });
    }
  }

  const lower = cleaned.toLowerCase();
  for (const topic of blockedTopics()) {
    if (topic && lower.includes(topic)) {
      hits.push({
        code: "blocked_topic",
        message: `Blocked topic matched: "${topic}"`,
      });
    }
  }

  if (hits.length > 0) {
    return {
      ok: false,
      error: hits[0]!.message,
      hits,
    };
  }

  // Soft warning: lots of ALL CAPS (noise / spam-ish) — allow but warn
  const letters = cleaned.replace(/[^a-zA-Z]/g, "");
  if (letters.length > 40) {
    const caps = letters.replace(/[^A-Z]/g, "").length;
    if (caps / letters.length > 0.7) {
      warnings.push({
        code: "shouting",
        message: "Input is mostly capitals (allowed, flagged).",
      });
    }
  }

  return { ok: true, cleaned, warnings };
}

/**
 * Light check on model output before returning to the client.
 */
export function guardModelOutput(text: string): {
  text: string;
  truncated: boolean;
  warnings: GuardrailHit[];
} {
  let out = String(text ?? "");
  const warnings: GuardrailHit[] = [];
  let truncated = false;

  if (out.length > MAX_OUTPUT_CHARS) {
    out = out.slice(0, MAX_OUTPUT_CHARS) + "\n…[truncated by guardrail]";
    truncated = true;
    warnings.push({
      code: "output_truncated",
      message: `Output truncated to ${MAX_OUTPUT_CHARS} chars`,
    });
  }

  // Strip accidental role-play leaks
  if (/^\s*system\s*:/im.test(out)) {
    warnings.push({
      code: "output_system_leak",
      message: "Output looked like a system role line (flagged).",
    });
  }

  return { text: out, truncated, warnings };
}

export function describeGuardrails(): {
  maxInputChars: number;
  maxOutputChars: number;
  maxOutputTokens: number;
  blockedTopics: string[];
  injectionChecks: string[];
} {
  return {
    maxInputChars: MAX_INPUT_CHARS,
    maxOutputChars: MAX_OUTPUT_CHARS,
    maxOutputTokens: getMaxOutputTokens(),
    blockedTopics: blockedTopics(),
    injectionChecks: INJECTION_PATTERNS.map((p) => p.code),
  };
}
