import type { SearchResult } from "../types.js";
export interface HybridResult<T> {
    item: T;
    score: number;
    sources: {
        fts?: number;
        vector?: number;
    };
}
/** Reciprocal-rank-fusion contribution for a 1-based rank. */
export declare function rrfScore(rank: number, k?: number): number;
/** Stable identity for a chunk across the FTS and vector arms. */
export declare function chunkKey(documentId: string, chunkIndex: number): string;
/**
 * Keep only results whose parent document is in `allowedDocIds`. Used to apply
 * a `source` filter to backends that can't express it in the query itself
 * (e.g. Postgres, where chunks.parent_id is polymorphic).
 */
export declare function filterResultsByDocIds(results: SearchResult[], allowedDocIds: Set<string>): SearchResult[];
/**
 * Exponential recency decay in [0, 1]: 1 at age 0, halving every
 * `halfLifeDays`. Negative ages (clock skew / future timestamps) clamp to 1; a
 * non-positive half-life disables the boost (returns 0).
 */
export declare function recencyDecayFactor(ageDays: number, halfLifeDays: number): number;
export interface RecencyOptions {
    weight: number;
    halfLifeDays: number;
    now: Date;
}
/**
 * Multiplicatively boost each result's score by its freshness:
 * `score * (1 + weight * decay)`. Records the applied `recencyBoost`. Results
 * without an `indexedAt` are returned untouched. Pure — does not re-sort.
 */
export declare function applyRecencyDecay(results: SearchResult[], { weight, halfLifeDays, now }: RecencyOptions): SearchResult[];
export interface CombineOptions {
    limit: number;
    k?: number;
    recencyWeight?: number;
    recencyHalfLifeDays?: number;
    now?: Date;
}
/**
 * Fuse FTS + vector results with RRF, optionally re-rank by recency, then take
 * the top `limit`. This is the single shared hybrid-search core both storage
 * backends delegate to (previously duplicated byte-for-byte in each).
 */
export declare function combineHybridResults(fts: SearchResult[], vector: SearchResult[], options: CombineOptions): SearchResult[];
export declare function fuseWithRRF<T>(ftsResults: T[], vectorResults: T[], getId: (item: T) => string, k?: number): HybridResult<T>[];
//# sourceMappingURL=search.d.ts.map