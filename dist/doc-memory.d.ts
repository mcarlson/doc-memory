import type { DocMemoryConfig, HybridSearchOptions, ExpandedChunk, ExpansionLevel, Document } from './types.js';
import type { Retriever, RetrievedChunk } from './retriever.js';
import type { StorageBackend } from './storage/interface.js';
import type { EmbeddingProvider } from './embeddings/interface.js';
import type { EventBus } from './events/bus.js';
import { IndexPipeline } from './indexer/pipeline.js';
export declare class DocMemory {
    readonly storage?: StorageBackend;
    readonly embeddings?: EmbeddingProvider;
    readonly events?: EventBus;
    readonly pipeline?: IndexPipeline;
    readonly retriever: Retriever;
    private watchers;
    constructor(config: DocMemoryConfig);
    /**
     * Backend methods (index/read/expand/list/startWatching/initialize) require a
     * storage/embeddings config. A retriever-only DocMemory ({ retriever }) has
     * none — calling them throws this clear error instead of a bare NPE.
     */
    private assertBackend;
    initialize(): Promise<void>;
    index(filepath: string, source?: 'directory' | 'chat'): Promise<string | null>;
    search(query: string, options?: HybridSearchOptions & {
        scope?: Record<string, unknown>;
    }): Promise<RetrievedChunk[]>;
    read(idOrFilename: string): Promise<{
        document: Document;
        content: string;
    } | null>;
    expand(chunkId: string, level?: ExpansionLevel): Promise<ExpandedChunk>;
    list(source?: string): Promise<Document[]>;
    startWatching(paths: string[], glob?: string): Promise<void>;
    stopWatching(): void;
    close(): Promise<void>;
}
//# sourceMappingURL=doc-memory.d.ts.map