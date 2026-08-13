import { expectTypeOf } from 'vitest';
import type { Retriever, RetrievalRequest, RetrievedChunk } from './index.js';

// RetrievedChunk carries the base fields + optional metadata
expectTypeOf<RetrievedChunk>().toMatchTypeOf<{
  documentId: string;
  filename: string;
  content: string;
  chunkIndex: number;
  score: number;
  sources: { fts?: number; vector?: number };
}>();
expectTypeOf<RetrievedChunk['metadata']>().toEqualTypeOf<Record<string, unknown> | undefined>();
expectTypeOf<RetrievedChunk['indexedAt']>().toEqualTypeOf<Date | undefined>();

// Retriever.search takes a request, returns chunks
expectTypeOf<Retriever['search']>().returns.resolves.toEqualTypeOf<RetrievedChunk[]>();
expectTypeOf<RetrievalRequest>().toMatchTypeOf<{ query: string }>();
