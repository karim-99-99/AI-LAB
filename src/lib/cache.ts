import { createHash } from "crypto";

export type CacheBackend = "memory" | "upstash" | "redis";

type MemoryEntry = {
  value: string;
  expiresAt: number;
};

const memory = new Map<string, MemoryEntry>();

const DEFAULT_TTL_SECONDS = Number(process.env.RAG_CACHE_TTL_SECONDS ?? 600);

function upstashConfig(): { url: string; token: string } | null {
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (!url || !token) return null;
  return { url, token };
}

function redisUrl(): string | null {
  const url = process.env.REDIS_URL?.trim();
  return url || null;
}

export function getCacheBackend(): CacheBackend {
  if (upstashConfig()) return "upstash";
  if (redisUrl()) return "redis";
  return "memory";
}

/** Stable hash for cache keys (question + retrieval settings). */
export function ragCacheKey(parts: {
  question: string;
  documentId: string | null;
  topK: number;
  minScore: number;
  model: string;
}): string {
  const raw = JSON.stringify({
    q: parts.question.trim().toLowerCase(),
    d: parts.documentId,
    k: parts.topK,
    m: parts.minScore,
    model: parts.model,
  });
  const hash = createHash("sha256").update(raw).digest("hex").slice(0, 32);
  return `rag:query:${hash}`;
}

async function memoryGet(key: string): Promise<string | null> {
  const hit = memory.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) {
    memory.delete(key);
    return null;
  }
  return hit.value;
}

async function memorySet(
  key: string,
  value: string,
  ttlSeconds: number
): Promise<void> {
  memory.set(key, {
    value,
    expiresAt: Date.now() + ttlSeconds * 1000,
  });
  if (memory.size > 200) {
    const first = memory.keys().next().value;
    if (first) memory.delete(first);
  }
}

async function upstashGet(
  url: string,
  token: string,
  key: string
): Promise<string | null> {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(["GET", key]),
    cache: "no-store",
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { result?: string | null };
  return typeof data.result === "string" ? data.result : null;
}

async function upstashSet(
  url: string,
  token: string,
  key: string,
  value: string,
  ttlSeconds: number
): Promise<void> {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(["SET", key, value, "EX", ttlSeconds]),
    cache: "no-store",
  });
  if (!res.ok) {
    console.error("[cache] upstash set failed", res.status);
  }
}

type RedisClient = {
  get: (key: string) => Promise<string | null>;
  set: (
    key: string,
    value: string,
    opts: { EX: number }
  ) => Promise<unknown>;
  quit: () => Promise<unknown>;
};

let redisClientPromise: Promise<RedisClient | null> | null = null;

async function getRedisClient(): Promise<RedisClient | null> {
  const url = redisUrl();
  if (!url) return null;
  if (!redisClientPromise) {
    redisClientPromise = (async () => {
      try {
        const { createClient } = await import("redis");
        const client = createClient({ url });
        client.on("error", (err) => {
          console.error("[cache] redis error", err);
        });
        await client.connect();
        return client as unknown as RedisClient;
      } catch (err) {
        console.error("[cache] redis connect failed", err);
        redisClientPromise = null;
        return null;
      }
    })();
  }
  return redisClientPromise;
}

async function dockerRedisGet(key: string): Promise<string | null> {
  const client = await getRedisClient();
  if (!client) return null;
  return client.get(key);
}

async function dockerRedisSet(
  key: string,
  value: string,
  ttlSeconds: number
): Promise<boolean> {
  const client = await getRedisClient();
  if (!client) return false;
  await client.set(key, value, { EX: ttlSeconds });
  return true;
}

/**
 * Priority: Upstash → Docker Redis (REDIS_URL) → memory
 */
export async function cacheGet(key: string): Promise<string | null> {
  const remote = upstashConfig();
  if (remote) {
    try {
      return await upstashGet(remote.url, remote.token, key);
    } catch (err) {
      console.error("[cache] upstash get error", err);
    }
  }

  if (redisUrl()) {
    try {
      const hit = await dockerRedisGet(key);
      if (hit != null) return hit;
    } catch (err) {
      console.error("[cache] redis get error, falling back to memory", err);
    }
  }

  return memoryGet(key);
}

export async function cacheSet(
  key: string,
  value: string,
  ttlSeconds = DEFAULT_TTL_SECONDS
): Promise<CacheBackend> {
  const remote = upstashConfig();
  if (remote) {
    try {
      await upstashSet(remote.url, remote.token, key, value, ttlSeconds);
      return "upstash";
    } catch (err) {
      console.error("[cache] upstash set error", err);
    }
  }

  if (redisUrl()) {
    try {
      const ok = await dockerRedisSet(key, value, ttlSeconds);
      if (ok) return "redis";
    } catch (err) {
      console.error("[cache] redis set error, using memory", err);
    }
  }

  await memorySet(key, value, ttlSeconds);
  return "memory";
}

export function getCacheTtlSeconds(): number {
  return DEFAULT_TTL_SECONDS;
}
