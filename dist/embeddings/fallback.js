/**
 * Tries the primary provider first; if it fails, falls back to the secondary.
 * After the first failure, switches permanently to avoid repeated timeouts.
 */
export class FallbackEmbeddings {
    primary;
    fallback;
    useFallback = false;
    get dimension() {
        return this.useFallback ? this.fallback.dimension : this.primary.dimension;
    }
    constructor(primary, fallback) {
        this.primary = primary;
        this.fallback = fallback;
        if (primary.dimension !== fallback.dimension) {
            throw new Error(`Primary embeddings (${primary.dimension}d) and fallback (${fallback.dimension}d) have different dimensions. ` +
                `Mixing them in the same index will produce incorrect search results. ` +
                `Use the same dimension for both, or start with a fresh database when switching.`);
        }
    }
    async generate(text) {
        if (this.useFallback) {
            return this.fallback.generate(text);
        }
        try {
            return await this.primary.generate(text);
        }
        catch (err) {
            console.warn(`[doc-memory] Primary embeddings failed, switching to fallback: ${err.message}`);
            this.useFallback = true;
            return this.fallback.generate(text);
        }
    }
    async generateBatch(texts) {
        if (this.useFallback) {
            return this.fallback.generateBatch(texts);
        }
        try {
            return await this.primary.generateBatch(texts);
        }
        catch (err) {
            console.warn(`[doc-memory] Primary embeddings failed, switching to fallback: ${err.message}`);
            this.useFallback = true;
            return this.fallback.generateBatch(texts);
        }
    }
}
