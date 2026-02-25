import Database from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';
import { randomUUID } from 'crypto';
import type { StorageBackend } from './interface.js';
import type { Document, Chunk, SearchResult, HybridSearchOptions, ExpandedChunk, ExpansionLevel } from '../types.js';
import { fuseWithRRF } from '../core/search.js';

export interface SQLiteConfig {
  path: string;
  dimension?: number;
}

export class SQLiteBackend implements StorageBackend {
  private db: Database.Database;
  private dimension: number;

  constructor(config: SQLiteConfig) {
    this.dimension = config.dimension || 384;
    this.db = new Database(config.path);
    sqliteVec.load(this.db);
  }

  async initialize(): Promise<void> {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS documents (
        id TEXT PRIMARY KEY,
        source TEXT NOT NULL,
        filename TEXT NOT NULL,
        filepath TEXT,
        content_hash TEXT NOT NULL,
        indexed_at TEXT NOT NULL,
        metadata TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_documents_hash ON documents(content_hash);
      CREATE INDEX IF NOT EXISTS idx_documents_filename ON documents(filename);

      CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
        content,
        document_id UNINDEXED,
        chunk_index UNINDEXED
      );

      CREATE TABLE IF NOT EXISTS chunks (
        id TEXT PRIMARY KEY,
        document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
        project_id TEXT,
        chunk_index INTEGER NOT NULL,
        content TEXT NOT NULL,
        page_number INTEGER,
        section_header TEXT,
        window_before TEXT,
        window_after TEXT,
        UNIQUE(document_id, chunk_index)
      );

      CREATE VIRTUAL TABLE IF NOT EXISTS chunks_vec USING vec0(
        id TEXT PRIMARY KEY,
        embedding float[${this.dimension}]
      );
    `);
  }

  async saveDocument(doc: Omit<Document, 'id'>): Promise<Document> {
    const id = randomUUID();
    const now = new Date().toISOString();

    this.db.prepare(`
      INSERT INTO documents (id, source, filename, filepath, content_hash, indexed_at, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, doc.source, doc.filename, doc.filepath || null, doc.contentHash, now, JSON.stringify(doc.metadata || {}));

    return { ...doc, id, indexedAt: new Date(now) };
  }

  async getDocument(id: string): Promise<Document | null> {
    const row = this.db.prepare('SELECT * FROM documents WHERE id = ?').get(id) as any;
    if (!row) return null;
    return this.rowToDocument(row);
  }

  async getDocumentByFilename(filename: string): Promise<Document | null> {
    const row = this.db.prepare('SELECT * FROM documents WHERE filename = ?').get(filename) as any;
    if (!row) return null;
    return this.rowToDocument(row);
  }

  async getDocumentByHash(hash: string): Promise<Document | null> {
    const row = this.db.prepare('SELECT * FROM documents WHERE content_hash = ?').get(hash) as any;
    if (!row) return null;
    return this.rowToDocument(row);
  }

  async listDocuments(source?: string): Promise<Document[]> {
    const rows = source
      ? this.db.prepare('SELECT * FROM documents WHERE source = ?').all(source)
      : this.db.prepare('SELECT * FROM documents').all();
    return (rows as any[]).map(this.rowToDocument);
  }

  async deleteDocument(id: string): Promise<void> {
    this.db.prepare('DELETE FROM chunks_fts WHERE document_id = ?').run(id);
    const chunks = this.db.prepare('SELECT id FROM chunks WHERE document_id = ?').all(id) as { id: string }[];
    for (const chunk of chunks) {
      this.db.prepare('DELETE FROM chunks_vec WHERE id = ?').run(chunk.id);
    }
    this.db.prepare('DELETE FROM chunks WHERE document_id = ?').run(id);
    this.db.prepare('DELETE FROM documents WHERE id = ?').run(id);
  }

  async saveChunks(documentId: string, chunks: Omit<Chunk, 'id' | 'documentId'>[]): Promise<void> {
    const insertChunk = this.db.prepare(`
      INSERT INTO chunks (id, document_id, project_id, chunk_index, content, page_number, section_header, window_before, window_after)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertFts = this.db.prepare(`
      INSERT INTO chunks_fts (content, document_id, chunk_index)
      VALUES (?, ?, ?)
    `);
    const insertVec = this.db.prepare(`
      INSERT INTO chunks_vec (id, embedding)
      VALUES (?, ?)
    `);

    const transaction = this.db.transaction(() => {
      for (const chunk of chunks) {
        const id = randomUUID();
        insertChunk.run(
          id, documentId, chunk.projectId || null, chunk.chunkIndex, chunk.content,
          chunk.pageNumber || null, chunk.sectionHeader || null,
          chunk.windowBefore || null, chunk.windowAfter || null
        );
        insertFts.run(chunk.content, documentId, chunk.chunkIndex);
        if (chunk.embedding) {
          insertVec.run(id, new Float32Array(chunk.embedding));
        }
      }
    });
    transaction();
  }

  async getChunks(documentId: string): Promise<Chunk[]> {
    const rows = this.db.prepare(`
      SELECT * FROM chunks WHERE document_id = ? ORDER BY chunk_index
    `).all(documentId) as any[];
    return rows.map(this.rowToChunk);
  }

  async getChunk(chunkId: string): Promise<Chunk | null> {
    const row = this.db.prepare('SELECT * FROM chunks WHERE id = ?').get(chunkId) as any;
    if (!row) return null;
    return this.rowToChunk(row);
  }

  async getChunkByIndex(documentId: string, index: number): Promise<Chunk | null> {
    const row = this.db.prepare(`
      SELECT * FROM chunks WHERE document_id = ? AND chunk_index = ?
    `).get(documentId, index) as any;
    if (!row) return null;
    return this.rowToChunk(row);
  }

  async getAdjacentChunks(documentId: string, index: number, window: number): Promise<Chunk[]> {
    const rows = this.db.prepare(`
      SELECT * FROM chunks
      WHERE document_id = ?
      AND chunk_index >= ? AND chunk_index <= ?
      ORDER BY chunk_index
    `).all(documentId, index - window, index + window) as any[];
    return rows.map(this.rowToChunk);
  }

  async searchFTS(query: string, limit: number): Promise<SearchResult[]> {
    const rows = this.db.prepare(`
      SELECT f.document_id, f.chunk_index, f.content, d.filename,
             bm25(chunks_fts) as score
      FROM chunks_fts f
      JOIN documents d ON f.document_id = d.id
      WHERE chunks_fts MATCH ?
      ORDER BY score
      LIMIT ?
    `).all(query, limit) as any[];

    return rows.map((r, idx) => ({
      documentId: r.document_id,
      filename: r.filename,
      content: r.content,
      chunkIndex: r.chunk_index,
      score: 1 / (60 + idx + 1),
      sources: { fts: idx + 1 },
    }));
  }

  async searchVector(embedding: number[], limit: number, threshold = 0.7): Promise<SearchResult[]> {
    const rows = this.db.prepare(`
      SELECT v.id, v.distance, c.document_id, c.chunk_index, c.content, d.filename
      FROM chunks_vec v
      JOIN chunks c ON v.id = c.id
      JOIN documents d ON c.document_id = d.id
      WHERE v.embedding MATCH ? AND k = ?
      ORDER BY v.distance
    `).all(new Float32Array(embedding), limit) as any[];

    return rows
      .filter(r => (1 - r.distance) >= threshold)
      .map((r, idx) => ({
        documentId: r.document_id,
        filename: r.filename,
        content: r.content,
        chunkIndex: r.chunk_index,
        score: 1 - r.distance,
        sources: { vector: idx + 1 },
      }));
  }

  async hybridSearch(query: string, embedding: number[], options: HybridSearchOptions = {}): Promise<SearchResult[]> {
    const limit = options.limit || 10;
    const [ftsResults, vectorResults] = await Promise.all([
      this.searchFTS(query, limit * 2),
      this.searchVector(embedding, limit * 2),
    ]);

    const fused = fuseWithRRF(
      ftsResults,
      vectorResults,
      (r) => `${r.documentId}:${r.chunkIndex}`,
      60
    );

    return fused.slice(0, limit).map(r => ({
      ...r.item,
      score: r.score,
      sources: r.sources,
    }));
  }

  async expandContext(chunkId: string, level: ExpansionLevel): Promise<ExpandedChunk> {
    const chunk = await this.getChunk(chunkId);
    if (!chunk) {
      return { expanded: '', original: '', expansionLevel: level };
    }

    const windowSize = level === 'adjacent' ? 1 : level === 'section' ? 3 : 10;
    const neighbors = await this.getAdjacentChunks(chunk.documentId, chunk.chunkIndex, windowSize);

    const expanded = neighbors.map(c => c.content).join('\n\n');
    const pages = neighbors.map(c => c.pageNumber).filter((p): p is number => p !== undefined);

    return {
      expanded,
      original: chunk.content,
      expansionLevel: level,
      pageRange: pages.length > 0 ? [Math.min(...pages), Math.max(...pages)] : undefined,
      chunks: neighbors.map(c => ({
        content: c.content,
        chunkIndex: c.chunkIndex,
        pageNumber: c.pageNumber,
        isTarget: c.id === chunkId,
      })),
    };
  }

  async close(): Promise<void> {
    this.db.close();
  }

  private rowToDocument(row: any): Document {
    return {
      id: row.id,
      source: row.source,
      filename: row.filename,
      filepath: row.filepath,
      contentHash: row.content_hash,
      indexedAt: new Date(row.indexed_at),
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
    };
  }

  private rowToChunk(row: any): Chunk {
    return {
      id: row.id,
      documentId: row.document_id,
      projectId: row.project_id,
      chunkIndex: row.chunk_index,
      content: row.content,
      pageNumber: row.page_number,
      sectionHeader: row.section_header,
      windowBefore: row.window_before,
      windowAfter: row.window_after,
    };
  }
}
