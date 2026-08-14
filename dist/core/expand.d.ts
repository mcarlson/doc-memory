import type { Chunk, ExpandedChunk, ExpansionLevel } from "../types.js";
/** Number of chunks to fetch on either side of the target for each level. */
export declare function expansionWindowSize(level: ExpansionLevel): number;
/**
 * Assemble the expanded-context view from a target chunk and its neighbours.
 *
 * Pure so both storage backends share identical behaviour (previously the
 * SQLite and Postgres implementations had diverged — only one sorted, only one
 * computed `pageRange`). Neighbours are sorted by `chunkIndex`; `pageRange` is
 * computed only from real numeric page numbers — SQLite returns `null` for
 * NULL columns, which must NOT collapse to a bogus `[0, N]` range.
 */
export declare function assembleExpandedChunk(target: Chunk, neighbors: Chunk[], level: ExpansionLevel): ExpandedChunk;
//# sourceMappingURL=expand.d.ts.map