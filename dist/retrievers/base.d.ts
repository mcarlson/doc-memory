import type { Retriever, RetrievalRequest, RetrievedChunk } from '../retriever.js';
import type { EmbeddingProvider } from '../embeddings/interface.js';
import type { StorageBackend } from '../storage/interface.js';
/**
 * doc-memory's default retriever: embed the query, then hybrid FTS + vector
 * search over the local store. Extracted verbatim from DocMemory.search so
 * behavior is preserved; a host can inject a different Retriever instead.
 */
export declare class BaseRetriever implements Retriever {
    private embeddings;
    private storage;
    constructor(embeddings: EmbeddingProvider, storage: StorageBackend);
    search(req: RetrievalRequest): Promise<RetrievedChunk[]>;
}
//# sourceMappingURL=base.d.ts.map