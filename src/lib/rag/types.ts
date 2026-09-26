export type ChunkMode = "basic" | "sentence_window" | "auto_merging";

export type RagChunk = {
  id: string;
  index: number;
  /** Text used for embedding / similarity search (leaf/child) */
  text: string;
  embedding: number[];
  charStart: number;
  charEnd: number;
  /**
   * Expanded neighbor text for LLM synthesis (sentence-window mode).
   * When set, retrieve scores `text` but sends `windowText` to the model.
   */
  windowText?: string;
  /** Parent id for auto-merging children */
  parentId?: string;
  parentIndex?: number;
};

/** Parent nodes stored for auto-merging (not embedded / not searched). */
export type RagParent = {
  id: string;
  index: number;
  text: string;
  childIds: string[];
  charStart: number;
  charEnd: number;
};

export type RagDocument = {
  id: string;
  filename: string;
  createdAt: string;
  charCount: number;
  chunkCount: number;
  embeddingModel: string;
  truncated: boolean;
  /** Preview of raw text */
  textPreview: string;
  chunkMode?: ChunkMode;
  /** Neighbor sentences on each side (sentence-window only) */
  windowSize?: number;
  /** Fraction of a parent's children that must hit to merge up (auto-merging) */
  mergeThreshold?: number;
  parentChunkSize?: number;
  childChunkSize?: number;
  parents?: RagParent[];
  chunks: RagChunk[];
};

export type RagStoreFile = {
  documents: RagDocument[];
};
