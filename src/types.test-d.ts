import { expectTypeOf } from 'vitest';
import type { SearchResult } from './types.js';
import type { RetrievedChunk } from './retriever.js';

// Every SearchResult is a valid RetrievedChunk (base retriever output is contract-compatible)
expectTypeOf<SearchResult>().toMatchTypeOf<RetrievedChunk>();
// metadata passthrough exists
expectTypeOf<SearchResult['metadata']>().toEqualTypeOf<Record<string, unknown> | undefined>();
