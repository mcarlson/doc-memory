import type { Retriever, RetrievalRequest, RetrievedChunk } from '../retriever.js';
import type { EmbeddingProvider } from '../embeddings/interface.js';
import type { StorageBackend } from '../storage/interface.js';

/**
 * doc-memory's default retriever: embed the query, then hybrid FTS + vector
 * search over the local store. Extracted verbatim from DocMemory.search so
 * behavior is preserved; a host can inject a different Retriever instead.
 */
export class BaseRetriever implements Retriever {
  constructor(
    private embeddings: EmbeddingProvider,
    private storage: StorageBackend,
  ) {}

  async search(req: RetrievalRequest): Promise<RetrievedChunk[]> {
    const embedding = await this.embeddings.generate(req.query);
    return this.storage.hybridSearch(req.query, embedding, {
      limit: req.limit,
      recencyWeight: req.recencyWeight,
      recencyHalfLife: req.recencyHalfLifeDays,
    });
  }
}
