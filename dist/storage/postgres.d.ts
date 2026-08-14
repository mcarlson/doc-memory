import type { SupabaseClient } from '@supabase/supabase-js';
import type { StorageBackend } from './interface.js';
import type { Document, Chunk, SearchResult, HybridSearchOptions, ExpandedChunk, ExpansionLevel } from '../types.js';
export interface PostgresConfig {
    supabase: SupabaseClient;
    projectId?: string;
}
export declare class PostgresBackend implements StorageBackend {
    private supabase;
    private projectId?;
    constructor(config: PostgresConfig);
    initialize(): Promise<void>;
    saveDocument(doc: Omit<Document, 'id'>): Promise<Document>;
    getDocument(id: string): Promise<Document | null>;
    getDocumentByFilename(filename: string): Promise<Document | null>;
    getDocumentByFilepath(filepath: string): Promise<Document | null>;
    getDocumentByHash(hash: string): Promise<Document | null>;
    listDocuments(source?: string): Promise<Document[]>;
    deleteDocument(id: string): Promise<void>;
    saveChunks(documentId: string, chunks: Omit<Chunk, 'id' | 'documentId'>[]): Promise<void>;
    getChunks(documentId: string): Promise<Chunk[]>;
    getChunk(chunkId: string): Promise<Chunk | null>;
    getChunkByIndex(documentId: string, index: number): Promise<Chunk | null>;
    getAdjacentChunks(documentId: string, index: number, window: number): Promise<Chunk[]>;
    searchFTS(query: string, limit: number, source?: string): Promise<SearchResult[]>;
    searchVector(embedding: number[], limit: number, threshold?: number, source?: string): Promise<SearchResult[]>;
    hybridSearch(query: string, embedding: number[], options?: HybridSearchOptions): Promise<SearchResult[]>;
    expandContext(chunkId: string, level: ExpansionLevel): Promise<ExpandedChunk>;
    close(): Promise<void>;
    private rowToDocument;
    private rowToChunk;
}
//# sourceMappingURL=postgres.d.ts.map