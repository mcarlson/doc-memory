import type { Document, Chunk, SearchResult, HybridSearchOptions, ExpandedChunk, ExpansionLevel } from '../types.js';

export interface StorageBackend {
  // Documents
  saveDocument(doc: Omit<Document, 'id'>): Promise<Document>;
  getDocument(id: string): Promise<Document | null>;
  getDocumentByFilename(filename: string): Promise<Document | null>;
  getDocumentByHash(hash: string): Promise<Document | null>;
  listDocuments(source?: string): Promise<Document[]>;
  deleteDocument(id: string): Promise<void>;

  // Chunks
  saveChunks(documentId: string, chunks: Omit<Chunk, 'id' | 'documentId'>[]): Promise<void>;
  getChunks(documentId: string): Promise<Chunk[]>;
  getChunk(chunkId: string): Promise<Chunk | null>;
  getChunkByIndex(documentId: string, index: number): Promise<Chunk | null>;
  getAdjacentChunks(documentId: string, index: number, window: number): Promise<Chunk[]>;

  // Search
  searchFTS(query: string, limit: number, source?: string): Promise<SearchResult[]>;
  searchVector(embedding: number[], limit: number, threshold?: number, source?: string): Promise<SearchResult[]>;
  hybridSearch(query: string, embedding: number[], options?: HybridSearchOptions): Promise<SearchResult[]>;

  // Context expansion
  expandContext(chunkId: string, level: ExpansionLevel): Promise<ExpandedChunk>;

  // Lifecycle
  initialize(): Promise<void>;
  close(): Promise<void>;
}
