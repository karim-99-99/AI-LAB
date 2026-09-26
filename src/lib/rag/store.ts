import { promises as fs } from "fs";
import path from "path";
import type { RagDocument, RagStoreFile } from "./types";
import { dataDir } from "@/lib/data-dir";

function ragDir() {
  return dataDir("rag");
}

function storePath() {
  return path.join(ragDir(), "documents.json");
}

async function ensure() {
  await fs.mkdir(ragDir(), { recursive: true });
  try {
    await fs.access(storePath());
  } catch {
    const empty: RagStoreFile = { documents: [] };
    await fs.writeFile(storePath(), JSON.stringify(empty, null, 2), "utf8");
  }
}

export async function readRagStore(): Promise<RagStoreFile> {
  await ensure();
  const raw = await fs.readFile(storePath(), "utf8");
  try {
    const parsed = JSON.parse(raw) as RagStoreFile;
    return { documents: parsed.documents ?? [] };
  } catch {
    return { documents: [] };
  }
}

export async function writeRagStore(store: RagStoreFile): Promise<void> {
  await ensure();
  await fs.writeFile(storePath(), JSON.stringify(store, null, 2), "utf8");
}

export async function listRagDocuments(): Promise<
  Omit<RagDocument, "chunks">[]
> {
  const store = await readRagStore();
  return store.documents.map(({ chunks: _c, ...meta }) => meta);
}

export async function getRagDocument(
  id: string
): Promise<RagDocument | null> {
  const store = await readRagStore();
  return store.documents.find((d) => d.id === id) ?? null;
}

export async function saveRagDocument(doc: RagDocument): Promise<void> {
  const store = await readRagStore();
  store.documents = [doc, ...store.documents.filter((d) => d.id !== doc.id)];
  // Keep last 20 docs for local practice
  store.documents = store.documents.slice(0, 20);
  await writeRagStore(store);
}

export async function deleteRagDocument(id: string): Promise<boolean> {
  const store = await readRagStore();
  const before = store.documents.length;
  store.documents = store.documents.filter((d) => d.id !== id);
  await writeRagStore(store);
  return store.documents.length < before;
}
