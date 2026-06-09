export interface ChunkOptions {
  maxSize?: number;
  overlap?: number;
  windowSize?: number;
}

export interface ChunkWithMetadata {
  content: string;
  index: number;
  pageNumber?: number;
  pageRange?: [number, number];
  windowBefore: string;
  windowAfter: string;
  sectionHeader?: string;
}

export interface Document {
  id: string;
  source: 'directory' | 'chat' | 'postgres';
  filename: string;
  filepath?: string;
  contentHash: string;
  indexedAt: Date;
  metadata?: Record<string, unknown>;
}

export interface Chunk {
  id: string;
  documentId: string;
  projectId?: string;
  chunkIndex: number;
  content: string;
  embedding?: number[];
  pageNumber?: number;
  sectionHeader?: string;
  windowBefore?: string;
  windowAfter?: string;
}

export interface SearchResult {
  documentId: string;
  chunkId?: string;
  filename: string;
  content: string;
  chunkIndex: number;
  score: number;
  sources: { fts?: number; vector?: number };
  recencyBoost?: number;
  /** When the parent document was indexed — carried so recency re-ranking stays pure. */
  indexedAt?: Date;
}

export interface HybridSearchOptions {
  limit?: number;
  source?: string;
  recencyWeight?: number;
  recencyHalfLife?: number;
  /** Minimum cosine similarity for a vector hit (default 0.7). */
  vectorThreshold?: number;
  filters?: Record<string, unknown>;
}

export type ExpansionLevel = 'adjacent' | 'section' | 'full';

export interface ExpandedChunk {
  expanded: string;
  original: string;
  expansionLevel: ExpansionLevel;
  pageRange?: [number, number];
  chunks?: {
    content: string;
    chunkIndex: number;
    pageNumber?: number;
    isTarget: boolean;
  }[];
}

export interface StorageConfig {
  type: 'sqlite' | 'postgres';
  path?: string;
  connectionString?: string;
  supabaseUrl?: string;
  supabaseKey?: string;
}

export interface SourceConfig {
  type: 'directory' | 'chat' | 'postgres';
  path?: string;
  glob?: string;
  format?: 'claude-jsonl';
  connectionString?: string;
}

export interface DocMemoryConfig {
  storage: StorageConfig;
  sources: SourceConfig[];
  embeddings: {
    pythonServiceUrl?: string;
    dimension?: number;
  };
  events?: {
    transport: 'memory';
  };
}
