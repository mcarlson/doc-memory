import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SQLiteBackend } from './sqlite.js';
import { unlinkSync, existsSync } from 'fs';

const TEST_DB = '/tmp/doc-memory-test.db';

describe('SQLiteBackend', () => {
  let backend: SQLiteBackend;

  beforeEach(async () => {
    if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
    backend = new SQLiteBackend({ path: TEST_DB });
    await backend.initialize();
  });

  afterEach(async () => {
    await backend.close();
    if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
  });

  it('should save and retrieve documents', async () => {
    const doc = await backend.saveDocument({
      source: 'directory',
      filename: 'test.md',
      contentHash: 'abc123',
      indexedAt: new Date(),
    });

    const retrieved = await backend.getDocument(doc.id);
    expect(retrieved?.filename).toBe('test.md');
  });

  it('should find documents by hash', async () => {
    await backend.saveDocument({
      source: 'directory',
      filename: 'test.md',
      contentHash: 'abc123',
      indexedAt: new Date(),
    });

    const found = await backend.getDocumentByHash('abc123');
    expect(found?.filename).toBe('test.md');
  });

  it('should find documents by filename', async () => {
    await backend.saveDocument({
      source: 'directory',
      filename: 'test.md',
      contentHash: 'abc123',
      indexedAt: new Date(),
    });

    const found = await backend.getDocumentByFilename('test.md');
    expect(found?.contentHash).toBe('abc123');
  });

  it('should list documents', async () => {
    await backend.saveDocument({ source: 'directory', filename: 'a.md', contentHash: 'h1', indexedAt: new Date() });
    await backend.saveDocument({ source: 'chat', filename: 'b.md', contentHash: 'h2', indexedAt: new Date() });

    const all = await backend.listDocuments();
    expect(all.length).toBe(2);

    const dirOnly = await backend.listDocuments('directory');
    expect(dirOnly.length).toBe(1);
    expect(dirOnly[0].filename).toBe('a.md');
  });

  it('should delete documents and their chunks', async () => {
    const doc = await backend.saveDocument({
      source: 'directory',
      filename: 'test.md',
      contentHash: 'abc123',
      indexedAt: new Date(),
    });

    await backend.saveChunks(doc.id, [
      { chunkIndex: 0, content: 'Hello world' },
    ]);

    await backend.deleteDocument(doc.id);

    const retrieved = await backend.getDocument(doc.id);
    expect(retrieved).toBeNull();

    const chunks = await backend.getChunks(doc.id);
    expect(chunks.length).toBe(0);
  });

  it('should save and search chunks via FTS', async () => {
    const doc = await backend.saveDocument({
      source: 'directory',
      filename: 'test.md',
      contentHash: 'abc123',
      indexedAt: new Date(),
    });

    await backend.saveChunks(doc.id, [
      { chunkIndex: 0, content: 'Hello world' },
      { chunkIndex: 1, content: 'Goodbye world' },
    ]);

    const results = await backend.searchFTS('hello', 10);
    expect(results.length).toBe(1);
    expect(results[0].content).toBe('Hello world');
  });

  it('should get chunks by index', async () => {
    const doc = await backend.saveDocument({
      source: 'directory',
      filename: 'test.md',
      contentHash: 'abc123',
      indexedAt: new Date(),
    });

    await backend.saveChunks(doc.id, [
      { chunkIndex: 0, content: 'First chunk' },
      { chunkIndex: 1, content: 'Second chunk' },
      { chunkIndex: 2, content: 'Third chunk' },
    ]);

    const chunk = await backend.getChunkByIndex(doc.id, 1);
    expect(chunk?.content).toBe('Second chunk');
  });

  it('should get adjacent chunks', async () => {
    const doc = await backend.saveDocument({
      source: 'directory',
      filename: 'test.md',
      contentHash: 'abc123',
      indexedAt: new Date(),
    });

    await backend.saveChunks(doc.id, [
      { chunkIndex: 0, content: 'First' },
      { chunkIndex: 1, content: 'Second' },
      { chunkIndex: 2, content: 'Third' },
      { chunkIndex: 3, content: 'Fourth' },
    ]);

    const adjacent = await backend.getAdjacentChunks(doc.id, 1, 1);
    expect(adjacent.length).toBe(3);
    expect(adjacent.map(c => c.content)).toEqual(['First', 'Second', 'Third']);
  });

  it('should include chunkId in FTS search results', async () => {
    const doc = await backend.saveDocument({
      source: 'directory',
      filename: 'test.md',
      contentHash: 'search1',
      indexedAt: new Date(),
    });
    await backend.saveChunks(doc.id, [{ chunkIndex: 0, content: 'authentication flow diagram' }]);
    const results = await backend.searchFTS('authentication', 10);
    expect(results.length).toBe(1);
    expect(results[0].chunkId).toBeDefined();
    expect(typeof results[0].chunkId).toBe('string');
  });

  it('should default to 384 dimensions', async () => {
    // The default backend (no explicit dimension) should accept 384-dim embeddings
    const doc = await backend.saveDocument({
      source: 'directory',
      filename: 'dim.md',
      contentHash: 'dimhash',
      indexedAt: new Date(),
    });
    const embedding = Array(384).fill(0.1);
    await backend.saveChunks(doc.id, [{ chunkIndex: 0, content: 'test', embedding }]);
    const chunks = await backend.getChunks(doc.id);
    expect(chunks.length).toBe(1);
  });

  it('should apply recency weighting to hybrid search results', async () => {
    // Create old doc (indexed 30 days ago)
    const oldDoc = await backend.saveDocument({
      source: 'directory',
      filename: 'old.md',
      contentHash: 'old1',
      indexedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
    });
    const embedding1 = Array(384).fill(0.1);
    await backend.saveChunks(oldDoc.id, [{ chunkIndex: 0, content: 'authentication guide', embedding: embedding1 }]);

    // Create recent doc (indexed today)
    const newDoc = await backend.saveDocument({
      source: 'directory',
      filename: 'new.md',
      contentHash: 'new1',
      indexedAt: new Date(),
    });
    const embedding2 = Array(384).fill(0.1);
    await backend.saveChunks(newDoc.id, [{ chunkIndex: 0, content: 'authentication guide updated', embedding: embedding2 }]);

    const queryEmbedding = Array(384).fill(0.1);

    const results = await backend.hybridSearch('authentication guide', queryEmbedding, {
      recencyWeight: 0.5,
      recencyHalfLife: 7,
    });

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].filename).toBe('new.md');
    expect(results[0].recencyBoost).toBeDefined();
    expect(results[0].recencyBoost!).toBeGreaterThan(0);
  });

  it('should delete all related data atomically', async () => {
    const doc = await backend.saveDocument({
      source: 'directory',
      filename: 'atomic.md',
      contentHash: 'atomic1',
      indexedAt: new Date(),
    });
    const embedding = Array(384).fill(0.1);
    await backend.saveChunks(doc.id, [
      { chunkIndex: 0, content: 'chunk zero', embedding },
      { chunkIndex: 1, content: 'chunk one', embedding },
    ]);

    await backend.deleteDocument(doc.id);

    expect(await backend.getDocument(doc.id)).toBeNull();
    expect((await backend.getChunks(doc.id)).length).toBe(0);
    expect((await backend.searchFTS('chunk', 10)).length).toBe(0);
  });

  it('should filter search results by source', async () => {
    const doc1 = await backend.saveDocument({
      source: 'directory',
      filename: 'dir.md',
      contentHash: 'src1',
      indexedAt: new Date(),
    });
    await backend.saveChunks(doc1.id, [{ chunkIndex: 0, content: 'shared keyword content' }]);

    const doc2 = await backend.saveDocument({
      source: 'chat',
      filename: 'chat.md',
      contentHash: 'src2',
      indexedAt: new Date(),
    });
    await backend.saveChunks(doc2.id, [{ chunkIndex: 0, content: 'shared keyword content here too' }]);

    const results = await backend.searchFTS('shared keyword', 10, 'directory');
    expect(results.length).toBe(1);
    expect(results[0].filename).toBe('dir.md');
  });

  it('should expand context around a chunk', async () => {
    const doc = await backend.saveDocument({
      source: 'directory',
      filename: 'test.md',
      contentHash: 'abc123',
      indexedAt: new Date(),
    });

    await backend.saveChunks(doc.id, [
      { chunkIndex: 0, content: 'Before' },
      { chunkIndex: 1, content: 'Target' },
      { chunkIndex: 2, content: 'After' },
    ]);

    const chunks = await backend.getChunks(doc.id);
    const targetChunkId = chunks[1].id;

    const expanded = await backend.expandContext(targetChunkId, 'adjacent');
    expect(expanded.original).toBe('Target');
    expect(expanded.expanded).toContain('Before');
    expect(expanded.expanded).toContain('Target');
    expect(expanded.expanded).toContain('After');
  });
});
