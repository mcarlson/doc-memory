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
