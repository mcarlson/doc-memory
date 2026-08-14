import type { StorageBackend } from '../storage/interface.js';
import type { EmbeddingProvider } from '../embeddings/interface.js';
import type { EventBus } from '../events/bus.js';
import type { ChunkOptions } from '../types.js';
export interface IndexOptions {
    source: 'directory' | 'chat';
    chunkOptions?: ChunkOptions;
    projectId?: string;
}
export declare class IndexPipeline {
    private storage;
    private embeddings;
    private events?;
    constructor(storage: StorageBackend, embeddings: EmbeddingProvider, events?: EventBus | undefined);
    indexFile(filepath: string, options: IndexOptions): Promise<string | null>;
    indexText(text: string, filename: string, options: IndexOptions): Promise<string | null>;
    /**
     * True only when this exact content is *fully* indexed. A leftover document
     * row with zero chunks (a previous attempt that failed after the document
     * was saved but before chunks were written) is deleted here so re-indexing
     * can recover, instead of being permanently blocked by the hash check.
     */
    private isAlreadyIndexed;
    private persist;
}
//# sourceMappingURL=pipeline.d.ts.map