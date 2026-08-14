import { describe, it, expect, vi } from 'vitest';
import { BaseRetriever } from './base.js';
const embeddings = { dimension: 3, generate: vi.fn(async () => [0.1, 0.2, 0.3]), generateBatch: vi.fn() };
const storage = {
    hybridSearch: vi.fn(async () => [
        { documentId: 'd', filename: 'f', content: 'c', chunkIndex: 0, score: 1, sources: { fts: 1 } },
    ]),
};
describe('BaseRetriever', () => {
    it('generates an embedding then delegates to storage.hybridSearch with mapped options', async () => {
        const r = new BaseRetriever(embeddings, storage);
        const out = await r.search({ query: 'q', limit: 7, recencyWeight: 0.5, recencyHalfLifeDays: 30 });
        expect(embeddings.generate).toHaveBeenCalledWith('q');
        expect(storage.hybridSearch).toHaveBeenCalledWith('q', [0.1, 0.2, 0.3], {
            limit: 7,
            recencyWeight: 0.5,
            recencyHalfLife: 30,
        });
        expect(out[0].chunkIndex).toBe(0);
    });
});
