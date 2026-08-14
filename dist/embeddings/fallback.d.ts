import type { EmbeddingProvider } from './interface.js';
/**
 * Tries the primary provider first; if it fails, falls back to the secondary.
 * After the first failure, switches permanently to avoid repeated timeouts.
 */
export declare class FallbackEmbeddings implements EmbeddingProvider {
    private primary;
    private fallback;
    private useFallback;
    get dimension(): number;
    constructor(primary: EmbeddingProvider, fallback: EmbeddingProvider);
    generate(text: string): Promise<number[]>;
    generateBatch(texts: string[]): Promise<number[][]>;
}
//# sourceMappingURL=fallback.d.ts.map