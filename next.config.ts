import type { NextConfig } from "next";

/**
 * Native / heavy packages that must not be bundled by Next.
 * Vercel functions have a 250MB (unzipped) limit, so we also drop the
 * onnxruntime binaries for platforms other than linux-x64 (what Vercel runs).
 */
const nativeExcludes = [
  "./node_modules/onnxruntime-node/bin/napi-v3/darwin/**",
  "./node_modules/onnxruntime-node/bin/napi-v3/win32/**",
  "./node_modules/onnxruntime-node/bin/napi-v3/linux/arm64/**",
  "./node_modules/onnxruntime-web/dist/*.wasm",
  "./node_modules/onnxruntime-web/dist/*.mjs.map",
  "./node_modules/onnxruntime-web/dist/*.js.map",
  "./node_modules/@xenova/transformers/dist/**",
];

/**
 * pdfjs-dist requires `@napi-rs/canvas` through a dynamic createRequire(),
 * invisible to the tracer — include it (and the Linux binary Vercel needs) by hand.
 */
const nativeIncludes = [
  "./node_modules/@napi-rs/canvas/**",
  "./node_modules/@napi-rs/canvas-linux-x64-gnu/**",
  // pdfjs loads its worker + wasm/cmaps by URL at runtime (also untraceable).
  "./node_modules/pdfjs-dist/legacy/build/**",
  "./node_modules/pdfjs-dist/wasm/**",
  "./node_modules/pdfjs-dist/cmaps/**",
  "./node_modules/pdfjs-dist/standard_fonts/**",
  // onnxruntime's .node addon dlopens libonnxruntime.so at runtime (untraceable).
  "./node_modules/onnxruntime-node/bin/napi-v3/linux/x64/**",
];

const nextConfig: NextConfig = {
  serverExternalPackages: [
    "pdf-parse",
    "pdfjs-dist",
    "@napi-rs/canvas",
    "@xenova/transformers",
    "onnxruntime-node",
  ],
  outputFileTracingExcludes: {
    "*": nativeExcludes,
  },
  // PDF parsing + embeddings are reached from many routes (RAG, agent tools,
  // eval), so include for all API functions.
  outputFileTracingIncludes: {
    "/api/**": nativeIncludes,
  },
};

export default nextConfig;
