import { describe, it, expect, vi } from 'vitest';
import { DocMemory } from './doc-memory.js';
describe('DocMemory injected retriever', () => {
    it('delegates search() to an injected retriever, not storage', async () => {
        const retriever = {
            search: vi.fn(async () => [
                { documentId: 'x', filename: 'f', content: 'c', chunkIndex: 0, score: 9, sources: {} },
            ]),
        };
        const dm = new DocMemory({ retriever }); // no storage/embeddings config
        const out = await dm.search('hello', { limit: 3 });
        expect(retriever.search).toHaveBeenCalledWith(expect.objectContaining({ query: 'hello', limit: 3 }));
        expect(out[0].score).toBe(9);
    });
    it('throws a clear error (not a bare NPE) when a backend method is called retriever-only', async () => {
        const retriever = { search: vi.fn(async () => []) };
        const dm = new DocMemory({ retriever });
        await expect(dm.initialize()).rejects.toThrow(/retriever-only/i);
        await expect(dm.read('x')).rejects.toThrow(/retriever-only/i);
        await expect(dm.index('/tmp/x')).rejects.toThrow(/retriever-only/i);
        await expect(dm.list()).rejects.toThrow(/retriever-only/i);
        await expect(dm.startWatching(['/tmp'])).rejects.toThrow(/retriever-only/i);
        await expect(dm.close()).resolves.toBeUndefined(); // close() is safe (optional-chained)
    });
});
