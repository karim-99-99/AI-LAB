import OpenAI from "openai";

export type AiProvider = "openai" | "groq";

/** Set in .env.local: AI_PROVIDER=groq or openai */
export function getProvider(): AiProvider {
  const value = (process.env.AI_PROVIDER ?? "groq").toLowerCase();
  return value === "openai" ? "openai" : "groq";
}

/**
 * Default models per provider.
 * Prefer getModelForTask(task) for Phase 5 routing.
 * Groq: fast = openai/gpt-oss-20b, strong = openai/gpt-oss-120b
 */
export function getDefaultModel(): string {
  if (process.env.AI_MODEL_FAST?.trim()) {
    return process.env.AI_MODEL_FAST.trim();
  }
  if (process.env.AI_MODEL?.trim()) {
    return process.env.AI_MODEL.trim();
  }
  return getProvider() === "openai" ? "gpt-4o-mini" : "openai/gpt-oss-20b";
}

/** @deprecated use getDefaultModel() */
export const DEFAULT_MODEL = getDefaultModel();

let client: OpenAI | null = null;
let clientProvider: AiProvider | null = null;

/** Lazy client so `next build` works before keys are set */
export function getOpenAI(): OpenAI {
  const provider = getProvider();

  if (client && clientProvider === provider) {
    return client;
  }

  if (provider === "groq") {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      throw new Error("Missing GROQ_API_KEY in .env.local");
    }
    client = new OpenAI({
      apiKey,
      baseURL: "https://api.groq.com/openai/v1",
    });
  } else {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("Missing OPENAI_API_KEY in .env.local");
    }
    client = new OpenAI({ apiKey });
  }

  clientProvider = provider;
  return client;
}
