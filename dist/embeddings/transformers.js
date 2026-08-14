// Known model dimensions
const MODEL_DIMENSIONS = {
    'Xenova/all-MiniLM-L6-v2': 384,
    'Xenova/bge-small-en-v1.5': 384,
    'Xenova/nomic-embed-text-v1.5': 768,
    'nomic-ai/nomic-embed-text-v1.5': 768,
};
export class TransformersJsEmbeddings {
    modelId;
    maxChars;
    pipeline = null;
    dimension;
    constructor(config = {}) {
        this.modelId = config.model || 'Xenova/all-MiniLM-L6-v2';
        const knownDim = MODEL_DIMENSIONS[this.modelId];
        if (!config.dimension && !knownDim && this.modelId !== 'Xenova/all-MiniLM-L6-v2') {
            console.error(`[doc-memory] Unknown model "${this.modelId}" — defaulting to 384 dimensions. Set DOC_MEMORY_EMBEDDINGS dimension explicitly if this model produces a different size.`);
        }
        this.dimension = config.dimension || knownDim || 384;
        this.maxChars = config.maxChars || 2000;
    }
    async getPipeline() {
        if (!this.pipeline) {
            const { pipeline } = await import('@huggingface/transformers');
            this.pipeline = await pipeline('feature-extraction', this.modelId);
        }
        return this.pipeline;
    }
    async generate(text) {
        const [embedding] = await this.generateBatch([text]);
        return embedding;
    }
    async generateBatch(texts) {
        if (texts.length === 0)
            return [];
        const pipe = await this.getPipeline();
        const results = [];
        for (const text of texts) {
            const truncated = text.slice(0, this.maxChars);
            const output = await pipe(truncated, { pooling: 'mean', normalize: true });
            // output is a Tensor — extract the array
            const embedding = Array.from(output.data).slice(0, this.dimension);
            results.push(embedding);
        }
        return results;
    }
}
