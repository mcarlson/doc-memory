import type { EmbeddingProvider } from './interface.js';
export interface TransformersConfig {
    /** Model ID from Hugging Face. Default: 'Xenova/all-MiniLM-L6-v2' */
    model?: string;
    /** Embedding dimension. Inferred from model if not set. */
    dimension?: number;
    /** Max characters to process per text (truncated). Default: 2000 */
    maxChars?: number;
}
export declare class TransformersJsEmbeddings implements EmbeddingProvider {
    private modelId;
    private maxChars;
    private pipeline;
    readonly dimension: number;
    constructor(config?: TransformersConfig);
    private getPipeline;
    generate(text: string): Promise<number[]>;
    generateBatch(texts: string[]): Promise<number[][]>;
}
//# sourceMappingURL=transformers.d.ts.map