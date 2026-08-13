import { describe, it, expect, vi } from 'vitest';
import { DocMemory } from './doc-memory.js';

describe('DocMemory injected retriever', () => {
  it('delegates search() to an injected retriever, not storage', async () => {
    const retriever = {
      search: vi.fn(async () => [
        { documentId: 'x', filename: 'f', content: 'c', chunkIndex: 0, score: 9, sources: {} },
      ]),
    };
    const dm = new DocMemory({ retriever } as any); // no storage/embeddings config
    const out = await dm.search('hello', { limit: 3 });
    expect(retriever.search).toHaveBeenCalledWith(expect.objectContaining({ query: 'hello', limit: 3 }));
    expect(out[0].score).toBe(9);
  });
});
