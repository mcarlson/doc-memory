export class PythonServiceEmbeddings {
    url;
    maxBatchSize;
    dimension = 768;
    constructor(config) {
        this.url = config.url;
        this.maxBatchSize = config.maxBatchSize || 100;
    }
    async generate(text) {
        const [embedding] = await this.generateBatch([text]);
        return embedding;
    }
    async generateBatch(texts) {
        if (texts.length === 0)
            return [];
        if (texts.length > this.maxBatchSize) {
            // Split oversized batches instead of throwing — large documents (e.g.
            // long court PDFs producing >maxBatchSize chunks) must still index.
            const out = [];
            for (let i = 0; i < texts.length; i += this.maxBatchSize) {
                const batch = await this.generateBatch(texts.slice(i, i + this.maxBatchSize));
                out.push(...batch);
            }
            return out;
        }
        const response = await fetch(`${this.url}/embed`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ texts: texts.map((t) => t.slice(0, 8000)) }),
        });
        if (!response.ok) {
            throw new Error(`Embedding service returned ${response.status}`);
        }
        const data = await response.json();
        if (!data.embeddings || data.embeddings.length !== texts.length) {
            throw new Error(`Expected ${texts.length} embeddings, got ${data.embeddings?.length || 0}`);
        }
        for (const embedding of data.embeddings) {
            if (embedding.length !== this.dimension) {
                throw new Error(`Embedding dimension mismatch: got ${embedding.length}, expected ${this.dimension}`);
            }
        }
        return data.embeddings;
    }
}
