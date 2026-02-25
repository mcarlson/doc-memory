import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { IndexPipeline } from './pipeline.js';
import { SQLiteBackend } from '../storage/sqlite.js';
import type { EmbeddingProvider } from '../embeddings/interface.js';
import { writeFileSync, unlinkSync, existsSync } from 'fs';

const TEST_DB = '/tmp/doc-memory-pipeline-test.db';
const TEST_FILE = '/tmp/doc-memory-test-file.md';

function mockEmbeddings(): EmbeddingProvider {
  return {
    dimension: 384,
    generate: async () => Array(384).fill(0.1),
    generateBatch: async (texts) => texts.map(() => Array(384).fill(0.1)),
  };
}

describe('IndexPipeline', () => {
  let backend: SQLiteBackend;
  let pipeline: IndexPipeline;

  beforeEach(async () => {
    if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
    backend = new SQLiteBackend({ path: TEST_DB, dimension: 384 });
    await backend.initialize();
    pipeline = new IndexPipeline(backend, mockEmbeddings());
  });

  afterEach(async () => {
    await backend.close();
    if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
    if (existsSync(TEST_FILE)) unlinkSync(TEST_FILE);
  });

  it('should delete old document when re-indexing modified file', async () => {
    writeFileSync(TEST_FILE, 'original content');
    const id1 = await pipeline.indexFile(TEST_FILE, { source: 'directory' });
    expect(id1).not.toBeNull();

    // Modify file
    writeFileSync(TEST_FILE, 'updated content');
    const id2 = await pipeline.indexFile(TEST_FILE, { source: 'directory' });
    expect(id2).not.toBeNull();
    expect(id2).not.toBe(id1);

    // Old doc should be gone
    const docs = await backend.listDocuments();
    expect(docs.length).toBe(1);
    expect(docs[0].id).toBe(id2);
  });

  it('should skip indexing if content unchanged', async () => {
    writeFileSync(TEST_FILE, 'same content');
    const id1 = await pipeline.indexFile(TEST_FILE, { source: 'directory' });
    const id2 = await pipeline.indexFile(TEST_FILE, { source: 'directory' });
    expect(id1).not.toBeNull();
    expect(id2).toBeNull(); // skipped
  });

  it('should not index empty files', async () => {
    writeFileSync(TEST_FILE, '');
    const id = await pipeline.indexFile(TEST_FILE, { source: 'directory' });
    expect(id).toBeNull();
    const docs = await backend.listDocuments();
    expect(docs.length).toBe(0);
  });
});
