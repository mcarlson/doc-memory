import { describe, it, expect, afterEach } from 'vitest';
import { DocMemory } from './doc-memory.js';
import { existsSync, unlinkSync } from 'fs';

const TEST_DB = '/tmp/doc-memory-class-test.db';

describe('DocMemory', () => {
  afterEach(() => {
    if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
  });

  it('should construct with local embeddings when no pythonServiceUrl', () => {
    const dm = new DocMemory({
      storage: { type: 'sqlite', path: TEST_DB },
      sources: [],
      embeddings: {},
    });
    expect(dm.embeddings.dimension).toBe(384);
  });

  it('should construct with python embeddings when pythonServiceUrl set', () => {
    const dm = new DocMemory({
      storage: { type: 'sqlite', path: TEST_DB },
      sources: [],
      embeddings: { pythonServiceUrl: 'http://localhost:8000' },
    });
    expect(dm.embeddings.dimension).toBe(768);
  });
});
