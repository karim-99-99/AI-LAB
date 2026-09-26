const MAX_CHARS = 14_000;
/** Higher limit for RAG ingest (local practice). */
const RAG_MAX_CHARS = 200_000;

export type PdfExtractResult = {
  text: string;
  truncated: boolean;
  pageHint?: string;
};

let domPolyfilled = false;

/**
 * pdfjs-dist (used by pdf-parse) expects browser globals like DOMMatrix.
 * In Node it polyfills them from `@napi-rs/canvas`, but it loads that package
 * through a dynamic createRequire() that serverless bundlers (Vercel) cannot
 * trace — so the package is missing at runtime and module load throws
 * "DOMMatrix is not defined".
 *
 * Referencing the package here makes the tracer include it. If it still cannot
 * load (e.g. native binary mismatch), install a minimal stub: we only extract
 * text and never render, so the matrix math is never actually used.
 */
async function ensureDomGlobals(): Promise<void> {
  if (domPolyfilled) return;
  domPolyfilled = true;
  const g = globalThis as Record<string, unknown>;
  if (g.DOMMatrix) return;
  try {
    const canvas = (await import("@napi-rs/canvas")) as Record<string, unknown>;
    if (canvas.DOMMatrix) g.DOMMatrix = canvas.DOMMatrix;
    if (canvas.ImageData && !g.ImageData) g.ImageData = canvas.ImageData;
    if (canvas.Path2D && !g.Path2D) g.Path2D = canvas.Path2D;
  } catch {
    // fall through to stub
  }
  if (!g.DOMMatrix) {
    class DOMMatrixStub {
      a = 1; b = 0; c = 0; d = 1; e = 0; f = 0;
      is2D = true;
      constructor(init?: number[]) {
        if (Array.isArray(init) && init.length >= 6) {
          [this.a, this.b, this.c, this.d, this.e, this.f] = init as [
            number, number, number, number, number, number,
          ];
        }
      }
      translate() { return new DOMMatrixStub([this.a, this.b, this.c, this.d, this.e, this.f]); }
      scale() { return new DOMMatrixStub([this.a, this.b, this.c, this.d, this.e, this.f]); }
      multiply() { return new DOMMatrixStub([this.a, this.b, this.c, this.d, this.e, this.f]); }
      inverse() { return new DOMMatrixStub([this.a, this.b, this.c, this.d, this.e, this.f]); }
    }
    g.DOMMatrix = DOMMatrixStub;
  }
}

/**
 * Extract text from a PDF buffer. Groq has no native PDF input —
 * we parse locally then send text to the model.
 */
export async function extractPdfText(
  buffer: Buffer,
  options?: { maxChars?: number }
): Promise<PdfExtractResult> {
  const maxChars = options?.maxChars ?? MAX_CHARS;
  await ensureDomGlobals();
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    const full = (result.text || "").replace(/\s+\n/g, "\n").trim();

    if (!full) {
      throw new Error("No extractable text in PDF (maybe scanned image-only)");
    }

    if (full.length <= maxChars) {
      return { text: full, truncated: false };
    }

    return {
      text: full.slice(0, maxChars),
      truncated: true,
      pageHint: `Truncated to ${maxChars} chars for model context`,
    };
  } finally {
    await parser.destroy();
  }
}

export async function extractPdfTextForRag(
  buffer: Buffer
): Promise<PdfExtractResult> {
  return extractPdfText(buffer, { maxChars: RAG_MAX_CHARS });
}
