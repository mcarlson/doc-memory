/** Reciprocal-rank-fusion contribution for a 1-based rank. */
export function rrfScore(rank, k = 60) {
    return 1 / (k + rank);
}
/** Stable identity for a chunk across the FTS and vector arms. */
export function chunkKey(documentId, chunkIndex) {
    return `${documentId}:${chunkIndex}`;
}
/**
 * Keep only results whose parent document is in `allowedDocIds`. Used to apply
 * a `source` filter to backends that can't express it in the query itself
 * (e.g. Postgres, where chunks.parent_id is polymorphic).
 */
export function filterResultsByDocIds(results, allowedDocIds) {
    return results.filter((r) => allowedDocIds.has(r.documentId));
}
/**
 * Exponential recency decay in [0, 1]: 1 at age 0, halving every
 * `halfLifeDays`. Negative ages (clock skew / future timestamps) clamp to 1; a
 * non-positive half-life disables the boost (returns 0).
 */
export function recencyDecayFactor(ageDays, halfLifeDays) {
    if (halfLifeDays <= 0)
        return 0;
    const age = Math.max(0, ageDays);
    return Math.pow(2, -age / halfLifeDays);
}
const MS_PER_DAY = 86_400_000;
const DEFAULT_HALF_LIFE_DAYS = 30;
/**
 * Multiplicatively boost each result's score by its freshness:
 * `score * (1 + weight * decay)`. Records the applied `recencyBoost`. Results
 * without an `indexedAt` are returned untouched. Pure — does not re-sort.
 */
export function applyRecencyDecay(results, { weight, halfLifeDays, now }) {
    return results.map((r) => {
        if (!r.indexedAt)
            return r;
        const ageDays = (now.getTime() - r.indexedAt.getTime()) / MS_PER_DAY;
        const recencyBoost = weight * recencyDecayFactor(ageDays, halfLifeDays);
        return { ...r, score: r.score * (1 + recencyBoost), recencyBoost };
    });
}
/**
 * Fuse FTS + vector results with RRF, optionally re-rank by recency, then take
 * the top `limit`. This is the single shared hybrid-search core both storage
 * backends delegate to (previously duplicated byte-for-byte in each).
 */
export function combineHybridResults(fts, vector, options) {
    const k = options.k ?? 60;
    const fused = fuseWithRRF(fts, vector, (r) => chunkKey(r.documentId, r.chunkIndex), k);
    let results = fused.map((r) => ({
        ...r.item,
        score: r.score,
        sources: r.sources,
    }));
    if (options.recencyWeight && options.recencyWeight > 0) {
        results = applyRecencyDecay(results, {
            weight: options.recencyWeight,
            halfLifeDays: options.recencyHalfLifeDays ?? DEFAULT_HALF_LIFE_DAYS,
            now: options.now ?? new Date(),
        });
        results.sort((a, b) => b.score - a.score);
    }
    return results.slice(0, options.limit);
}
export function fuseWithRRF(ftsResults, vectorResults, getId, k = 60) {
    const scores = new Map();
    ftsResults.forEach((item, index) => {
        const id = getId(item);
        const rank = index + 1;
        const entry = scores.get(id) || { item, score: 0, sources: {} };
        entry.score += 1 / (k + rank);
        entry.sources.fts = rank;
        scores.set(id, entry);
    });
    vectorResults.forEach((item, index) => {
        const id = getId(item);
        const rank = index + 1;
        const entry = scores.get(id) || { item, score: 0, sources: {} };
        entry.score += 1 / (k + rank);
        entry.sources.vector = rank;
        scores.set(id, entry);
    });
    return [...scores.values()].sort((a, b) => b.score - a.score);
}
