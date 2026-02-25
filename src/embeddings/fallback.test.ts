import { describe, it, expect } from 'vitest';
import { FallbackEmbeddings } from './fallback.js';
import type { EmbeddingProvider } from './interface.js';

function mockProvider(dim: number): EmbeddingProvider {
  return {
    dimension: dim,
    generate: async () => Array(dim).fill(0),
    generateBatch: async (texts) => texts.map(() => Array(dim).fill(0)),
  };
}

describe('FallbackEmbeddings', () => {
  it('should throw if primary and fallback have different dimensions', () => {
    expect(() => new FallbackEmbeddings(mockProvider(768), mockProvider(384))).toThrow(/dimension/i);
  });

  it('should allow same-dimension providers', () => {
    const fb = new FallbackEmbeddings(mockProvider(384), mockProvider(384));
    expect(fb.dimension).toBe(384);
  });

  it('should fall back to secondary on primary failure', async () => {
    const failing: EmbeddingProvider = {
      dimension: 384,
      generate: async () => { throw new Error('fail'); },
      generateBatch: async () => { throw new Error('fail'); },
    };
    const fb = new FallbackEmbeddings(failing, mockProvider(384));
    const result = await fb.generate('test');
    expect(result.length).toBe(384);
  });
});
