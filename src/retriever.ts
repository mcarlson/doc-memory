// The read-side Retriever plugin contract. Defined here in the main package
// (not doc-memory-core) so a consumer can depend on `doc-memory` alone via a
// git tag — doc-memory-core lives in a subdir and isn't independently
// git-installable. Types-only; erased at runtime.

export interface RetrievedChunk {
  documentId: string;
  chunkId?: string;
  filename: string;
  content: string;
  chunkIndex: number;
  score: number;
  sources: { fts?: number; vector?: number };
  recencyBoost?: number;
  indexedAt?: Date;
  /** Plugin passthrough (opaque to doc-memory core). */
  metadata?: Record<string, unknown>;
}

export interface RetrievalRequest {
  query: string;
  limit?: number;
  /** Opaque passthrough; doc-memory core never inspects it. */
  scope?: Record<string, unknown>;
  /** Advisory — a retriever MAY ignore recency hints. */
  recencyWeight?: number;
  recencyHalfLifeDays?: number;
}

export interface Retriever {
  search(req: RetrievalRequest): Promise<RetrievedChunk[]>;
}
