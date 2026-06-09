import type { Chunk, ExpandedChunk, ExpansionLevel } from "../types.js";

/** Number of chunks to fetch on either side of the target for each level. */
export function expansionWindowSize(level: ExpansionLevel): number {
  switch (level) {
    case "adjacent":
      return 1;
    case "section":
      return 3;
    case "full":
      return 10;
  }
}

/**
 * Assemble the expanded-context view from a target chunk and its neighbours.
 *
 * Pure so both storage backends share identical behaviour (previously the
 * SQLite and Postgres implementations had diverged — only one sorted, only one
 * computed `pageRange`). Neighbours are sorted by `chunkIndex`; `pageRange` is
 * computed only from real numeric page numbers — SQLite returns `null` for
 * NULL columns, which must NOT collapse to a bogus `[0, N]` range.
 */
export function assembleExpandedChunk(
  target: Chunk,
  neighbors: Chunk[],
  level: ExpansionLevel,
): ExpandedChunk {
  const sorted = [...neighbors].sort((a, b) => a.chunkIndex - b.chunkIndex);

  const pages = sorted
    .map((c) => c.pageNumber)
    .filter((p): p is number => typeof p === "number");

  return {
    expanded: sorted.map((c) => c.content).join("\n\n"),
    original: target.content,
    expansionLevel: level,
    pageRange:
      pages.length > 0 ? [Math.min(...pages), Math.max(...pages)] : undefined,
    chunks: sorted.map((c) => ({
      content: c.content,
      chunkIndex: c.chunkIndex,
      pageNumber: c.pageNumber,
      isTarget: c.id === target.id,
    })),
  };
}
