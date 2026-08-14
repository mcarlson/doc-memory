import type { EmbeddingProvider } from "./interface.js";
export interface PythonServiceConfig {
    url: string;
    maxBatchSize?: number;
}
export declare class PythonServiceEmbeddings implements EmbeddingProvider {
    private url;
    private maxBatchSize;
    readonly dimension = 768;
    constructor(config: PythonServiceConfig);
    generate(text: string): Promise<number[]>;
    generateBatch(texts: string[]): Promise<number[][]>;
}
//# sourceMappingURL=python-service.d.ts.map