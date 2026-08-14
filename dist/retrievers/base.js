/**
 * doc-memory's default retriever: embed the query, then hybrid FTS + vector
 * search over the local store. Extracted verbatim from DocMemory.search so
 * behavior is preserved; a host can inject a different Retriever instead.
 */
export class BaseRetriever {
    embeddings;
    storage;
    constructor(embeddings, storage) {
        this.embeddings = embeddings;
        this.storage = storage;
    }
    async search(req) {
        const embedding = await this.embeddings.generate(req.query);
        return this.storage.hybridSearch(req.query, embedding, {
            limit: req.limit,
            recencyWeight: req.recencyWeight,
            recencyHalfLife: req.recencyHalfLifeDays,
        });
    }
}
