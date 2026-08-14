import { z } from 'zod';
import type { StorageBackend } from './storage/interface.js';
import type { EmbeddingProvider } from './embeddings/interface.js';
export declare const SearchSchema: z.ZodObject<{
    query: z.ZodString;
    limit: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
    source: z.ZodOptional<z.ZodString>;
    recency_weight: z.ZodOptional<z.ZodNumber>;
    recency_half_life: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    limit: number;
    query: string;
    source?: string | undefined;
    recency_weight?: number | undefined;
    recency_half_life?: number | undefined;
}, {
    query: string;
    source?: string | undefined;
    limit?: number | undefined;
    recency_weight?: number | undefined;
    recency_half_life?: number | undefined;
}>;
export declare const ReadSchema: z.ZodUnion<[z.ZodObject<{
    id: z.ZodString;
    filename: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    id: string;
    filename?: string | undefined;
}, {
    id: string;
    filename?: string | undefined;
}>, z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    filename: z.ZodString;
}, "strip", z.ZodTypeAny, {
    filename: string;
    id?: string | undefined;
}, {
    filename: string;
    id?: string | undefined;
}>]>;
export declare const ExpandSchema: z.ZodObject<{
    chunk_id: z.ZodString;
    level: z.ZodDefault<z.ZodEnum<["adjacent", "section", "full"]>>;
}, "strip", z.ZodTypeAny, {
    chunk_id: string;
    level: "adjacent" | "section" | "full";
}, {
    chunk_id: string;
    level?: "adjacent" | "section" | "full" | undefined;
}>;
export declare class DocMemoryServer {
    private server;
    private storage;
    private embeddings;
    constructor(storage: StorageBackend, embeddings: EmbeddingProvider);
    private setupHandlers;
    private handleSearch;
    private handleRead;
    private handleExpand;
    private handleList;
    private handleNavigate;
    run(): Promise<void>;
}
//# sourceMappingURL=mcp-server.d.ts.map