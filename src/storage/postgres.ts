import type { SupabaseClient } from '@supabase/supabase-js';
import type { StorageBackend } from './interface.js';
import type { Document, Chunk, SearchResult, HybridSearchOptions, ExpandedChunk, ExpansionLevel } from '../types.js';
import { combineHybridResults } from '../core/search.js';
import { expansionWindowSize, assembleExpandedChunk } from '../core/expand.js';

export interface PostgresConfig {
  supabase: SupabaseClient;
  projectId?: string;
}

export class PostgresBackend implements StorageBackend {
  private supabase: SupabaseClient;
  private projectId?: string;

  constructor(config: PostgresConfig) {
    this.supabase = config.supabase;
    this.projectId = config.projectId;
  }

  async initialize(): Promise<void> {
    // Tables should already exist in Supabase
  }

  async saveDocument(doc: Omit<Document, 'id'>): Promise<Document> {
    const { data, error } = await this.supabase
      .from('documents')
      .insert({
        source: doc.source,
        filename: doc.filename,
        filepath: doc.filepath,
        content_hash: doc.contentHash,
        indexed_at: doc.indexedAt.toISOString(),
        metadata: doc.metadata,
      })
      .select()
      .single();

    if (error) throw error;
    return this.rowToDocument(data);
  }

  async getDocument(id: string): Promise<Document | null> {
    const { data, error } = await this.supabase
      .from('documents')
      .select('*')
      .eq('id', id)
      .single();
    if (error && error.code !== 'PGRST116') throw error; // PGRST116 = not found
    return data ? this.rowToDocument(data) : null;
  }

  async getDocumentByFilename(filename: string): Promise<Document | null> {
    const { data, error } = await this.supabase
      .from('documents')
      .select('*')
      .eq('filename', filename)
      .single();
    if (error && error.code !== 'PGRST116') throw error;
    return data ? this.rowToDocument(data) : null;
  }

  async getDocumentByFilepath(filepath: string): Promise<Document | null> {
    const { data, error } = await this.supabase
      .from('documents')
      .select('*')
      .eq('filepath', filepath)
      .single();
    if (error && error.code !== 'PGRST116') throw error;
    return data ? this.rowToDocument(data) : null;
  }

  async getDocumentByHash(hash: string): Promise<Document | null> {
    const { data, error } = await this.supabase
      .from('documents')
      .select('*')
      .eq('content_hash', hash)
      .single();
    if (error && error.code !== 'PGRST116') throw error;
    return data ? this.rowToDocument(data) : null;
  }

  async listDocuments(source?: string): Promise<Document[]> {
    let query = this.supabase.from('documents').select('*');
    if (source) query = query.eq('source', source);
    const { data, error } = await query;
    if (error) throw error;
    return (data || []).map(this.rowToDocument);
  }

  async deleteDocument(id: string): Promise<void> {
    const { error: chunkErr } = await this.supabase.from('chunks').delete().eq('parent_id', id);
    if (chunkErr) throw chunkErr;
    const { error: docErr } = await this.supabase.from('documents').delete().eq('id', id);
    if (docErr) throw docErr;
  }

  async saveChunks(documentId: string, chunks: Omit<Chunk, 'id' | 'documentId'>[]): Promise<void> {
    const records = chunks.map(c => ({
      parent_type: 'document',
      parent_id: documentId,
      project_id: this.projectId,
      chunk_index: c.chunkIndex,
      content: c.content,
      embedding: c.embedding,
      page_number: c.pageNumber,
      section_header: c.sectionHeader,
      window_before: c.windowBefore,
      window_after: c.windowAfter,
    }));

    const { error } = await this.supabase.from('chunks').insert(records);
    if (error) throw error;
  }

  async getChunks(documentId: string): Promise<Chunk[]> {
    const { data, error } = await this.supabase
      .from('chunks')
      .select('*')
      .eq('parent_id', documentId)
      .order('chunk_index');
    if (error) throw error;
    return (data || []).map(this.rowToChunk);
  }

  async getChunk(chunkId: string): Promise<Chunk | null> {
    const { data, error } = await this.supabase
      .from('chunks')
      .select('*')
      .eq('id', chunkId)
      .single();
    if (error && error.code !== 'PGRST116') throw error;
    return data ? this.rowToChunk(data) : null;
  }

  async getChunkByIndex(documentId: string, index: number): Promise<Chunk | null> {
    const { data, error } = await this.supabase
      .from('chunks')
      .select('*')
      .eq('parent_id', documentId)
      .eq('chunk_index', index)
      .single();
    if (error && error.code !== 'PGRST116') throw error;
    return data ? this.rowToChunk(data) : null;
  }

  async getAdjacentChunks(documentId: string, index: number, window: number): Promise<Chunk[]> {
    const { data, error } = await this.supabase
      .from('chunks')
      .select('*')
      .eq('parent_id', documentId)
      .gte('chunk_index', index - window)
      .lte('chunk_index', index + window)
      .order('chunk_index');
    if (error) throw error;
    return (data || []).map(this.rowToChunk);
  }

  async searchFTS(query: string, limit: number, source?: string): Promise<SearchResult[]> {
    let q = this.supabase
      .from('chunks')
      .select('id, parent_id, chunk_index, content, documents!inner(filename, source)')
      .textSearch('content', query)
      .limit(limit);

    if (source) {
      q = q.eq('documents.source', source);
    }

    const { data, error } = await q;
    if (error) throw error;

    return (data || []).map((r: any, idx: number) => ({
      documentId: r.parent_id,
      chunkId: r.id,
      filename: (r.documents as any)?.filename || '',
      content: r.content,
      chunkIndex: r.chunk_index,
      score: 1 / (60 + idx + 1),
      sources: { fts: idx + 1 },
    }));
  }

  async searchVector(embedding: number[], limit: number, threshold = 0.7, source?: string): Promise<SearchResult[]> {
    const { data, error } = await this.supabase.rpc('match_chunks', {
      query_embedding: embedding,
      match_threshold: threshold,
      match_count: source ? limit * 3 : limit,
    });
    if (error) throw error;

    let results = (data || []).map((r: any, idx: number) => ({
      documentId: r.parent_id,
      chunkId: r.id,
      filename: r.filename || '',
      content: r.content,
      chunkIndex: r.chunk_index,
      score: r.similarity,
      sources: { vector: idx + 1 } as { vector?: number },
      source: r.source,
    }));

    if (source) {
      results = results.filter((r: any) => r.source === source);
    }

    return results.map(({ source: _s, ...rest }: any) => rest);
  }

  async hybridSearch(query: string, embedding: number[], options: HybridSearchOptions = {}): Promise<SearchResult[]> {
    const limit = options.limit || 10;
    const [ftsResults, vectorResults] = await Promise.all([
      this.searchFTS(query, limit * 2, options.source),
      this.searchVector(embedding, limit * 2, undefined, options.source),
    ]);

    // Thread indexedAt onto results so the pure combiner can apply recency decay
    const enriched = async (results: SearchResult[]) => {
      if (!options.recencyWeight) return results;
      const docIds = [...new Set(results.map(r => r.documentId))];
      const indexedAtMap = new Map<string, Date>();
      for (const docId of docIds) {
        const doc = await this.getDocument(docId);
        if (doc) indexedAtMap.set(docId, doc.indexedAt);
      }
      return results.map(r => ({ ...r, indexedAt: indexedAtMap.get(r.documentId) }));
    };

    return combineHybridResults(await enriched(ftsResults), await enriched(vectorResults), {
      limit,
      recencyWeight: options.recencyWeight,
      recencyHalfLifeDays: options.recencyHalfLife,
    });
  }

  async expandContext(chunkId: string, level: ExpansionLevel): Promise<ExpandedChunk> {
    const chunk = await this.getChunk(chunkId);
    if (!chunk) {
      return { expanded: '', original: '', expansionLevel: level };
    }

    const neighbors = await this.getAdjacentChunks(
      chunk.documentId, chunk.chunkIndex, expansionWindowSize(level),
    );
    return assembleExpandedChunk(chunk, neighbors, level);
  }

  async close(): Promise<void> {
    // Supabase client doesn't need explicit close
  }

  private rowToDocument(row: any): Document {
    return {
      id: row.id,
      source: row.source,
      filename: row.filename,
      filepath: row.filepath,
      contentHash: row.content_hash,
      indexedAt: new Date(row.indexed_at || row.created_at),
      metadata: row.metadata,
    };
  }

  private rowToChunk(row: any): Chunk {
    return {
      id: row.id,
      documentId: row.parent_id,
      projectId: row.project_id,
      chunkIndex: row.chunk_index,
      content: row.content,
      embedding: row.embedding,
      pageNumber: row.page_number,
      sectionHeader: row.section_header,
      windowBefore: row.window_before,
      windowAfter: row.window_after,
    };
  }
}
