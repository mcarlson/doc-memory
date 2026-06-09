import { describe, it, expect } from "vitest";
import { expansionWindowSize, assembleExpandedChunk } from "./expand.js";
import type { Chunk } from "../types.js";

function chunk(partial: Partial<Chunk> & { id: string; chunkIndex: number }): Chunk {
  return {
    documentId: "doc1",
    content: `content-${partial.chunkIndex}`,
    ...partial,
  };
}

describe("expansionWindowSize", () => {
  it("maps levels to window sizes", () => {
    expect(expansionWindowSize("adjacent")).toBe(1);
    expect(expansionWindowSize("section")).toBe(3);
    expect(expansionWindowSize("full")).toBe(10);
  });
});

describe("assembleExpandedChunk", () => {
  const target = chunk({ id: "b", chunkIndex: 1, content: "Target" });

  it("sorts neighbors by chunkIndex and joins their content", () => {
    const out = assembleExpandedChunk(
      target,
      [
        chunk({ id: "c", chunkIndex: 2, content: "After" }),
        chunk({ id: "a", chunkIndex: 0, content: "Before" }),
        target,
      ],
      "adjacent",
    );
    expect(out.expanded).toBe("Before\n\nTarget\n\nAfter");
    expect(out.original).toBe("Target");
    expect(out.expansionLevel).toBe("adjacent");
  });

  it("flags the target chunk via id", () => {
    const out = assembleExpandedChunk(
      target,
      [chunk({ id: "a", chunkIndex: 0 }), target],
      "adjacent",
    );
    expect(out.chunks?.find((c) => c.chunkIndex === 1)?.isTarget).toBe(true);
    expect(out.chunks?.find((c) => c.chunkIndex === 0)?.isTarget).toBe(false);
  });

  it("computes pageRange from real page numbers", () => {
    const out = assembleExpandedChunk(
      target,
      [
        chunk({ id: "a", chunkIndex: 0, pageNumber: 2 }),
        chunk({ id: "b", chunkIndex: 1, pageNumber: 3 }),
      ],
      "adjacent",
    );
    expect(out.pageRange).toEqual([2, 3]);
  });

  it("does NOT produce a [0, N] range when some chunks have no page (regression)", () => {
    // page_number comes back as null from SQLite; it must not collapse to 0.
    const out = assembleExpandedChunk(
      target,
      [
        chunk({ id: "a", chunkIndex: 0, pageNumber: null as unknown as undefined }),
        chunk({ id: "b", chunkIndex: 1, pageNumber: 3 }),
        chunk({ id: "c", chunkIndex: 2, pageNumber: null as unknown as undefined }),
      ],
      "adjacent",
    );
    expect(out.pageRange).toEqual([3, 3]);
  });

  it("omits pageRange entirely when no chunk has a page number", () => {
    const out = assembleExpandedChunk(
      target,
      [chunk({ id: "a", chunkIndex: 0 }), chunk({ id: "b", chunkIndex: 1 })],
      "adjacent",
    );
    expect(out.pageRange).toBeUndefined();
  });
});
