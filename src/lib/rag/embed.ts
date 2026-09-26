/**
 * Local embeddings (no Groq embedding model on free/dev accounts).
 * Uses Xenova/transformers — same idea as BGE/MiniLM in the course,
 * runs on your machine.
 */

type Pipeline = (
  texts: string | string[],
  options?: { pooling?: string; normalize?: boolean }
) => Promise<{ data: Float32Array; dims: number[] }>;

let embedderPromise: Promise<Pipeline> | null = null;

export function getEmbeddingModel(): string {
  return (
    process.env.EMBEDDING_MODEL?.trim() ||
    "Xenova/all-MiniLM-L6-v2"
  );
}

async function getEmbedder(): Promise<Pipeline> {
  if (!embedderPromise) {
    embedderPromise = (async () => {
      const { pipeline, env } = await import("@xenova/transformers");
      // On Vercel the app folder is read-only; downloaded model files must
      // go to /tmp (ephemeral, but re-download is only ~23MB).
      if (process.env.VERCEL || process.env.TRANSFORMERS_CACHE) {
        const os = await import("os");
        const path = await import("path");
        env.cacheDir =
          process.env.TRANSFORMERS_CACHE?.trim() ||
          path.join(os.tmpdir(), "transformers-cache");
        env.allowLocalModels = false;
      }
      // Feature extraction = embeddings
      return (await pipeline(
        "feature-extraction",
        getEmbeddingModel()
      )) as unknown as Pipeline;
    })();
  }
  return embedderPromise;
}

function tensorToArray(output: {
  data: Float32Array;
  dims: number[];
}): number[] {
  // Mean-pooled normalized vector
  return Array.from(output.data);
}

/** Cosine similarity between two vectors (for step 3 retrieval). */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/**
 * Embed texts locally with Transformers.js.
 * First run downloads the model (~20–30MB) once.
 */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (!texts.length) return [];

  const embedder = await getEmbedder();
  const out: number[][] = [];

  // Sequential is safer for memory on Windows laptops
  for (const text of texts) {
    const result = await embedder(text, {
      pooling: "mean",
      normalize: true,
    });
    out.push(tensorToArray(result));
  }

  return out;
}

export async function embedQuery(text: string): Promise<number[]> {
  const [vec] = await embedTexts([text]);
  if (!vec) throw new Error("Failed to embed query");
  return vec;
}
