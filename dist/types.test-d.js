import { expectTypeOf } from 'vitest';
// Every SearchResult is a valid RetrievedChunk (base retriever output is contract-compatible)
expectTypeOf().toMatchTypeOf();
// metadata passthrough exists
expectTypeOf().toEqualTypeOf();
