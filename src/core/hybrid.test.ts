import { describe, it, expect } from "vitest";
import {
  rrfScore,
  chunkKey,
  recencyDecayFactor,
  applyRecencyDecay,
  combineHybridResults,
  filterResultsByDocIds,
} from "./search.js";
import type { SearchResult } from "../types.js";

function result(partial: Partial<SearchResult> & { documentId: string; chunkIndex: number }): SearchResult {
  return {
    filename: `${partial.documentId}.md`,
    content: `c-${partial.chunkIndex}`,
    score: 0,
    sources: {},
    ...partial,
  };
}

describe("rrfScore", () => {
  it("computes 1/(k+rank)", () => {
    expect(rrfScore(1)).toBeCloseTo(1 / 61, 12);
    expect(rrfScore(1, 0)).toBe(1);
  });
});

describe("chunkKey", () => {
  it("joins documentId and chunkIndex", () => {
    expect(chunkKey("doc1", 4)).toBe("doc1:4");
  });
});

describe("recencyDecayFactor", () => {
  it("is 1 at zero age", () => {
    expect(recencyDecayFactor(0, 30)).toBe(1);
  });
  it("halves after one half-life", () => {
    expect(recencyDecayFactor(30, 30)).toBeCloseTo(0.5, 12);
  });
  it("clamps negative age (future docs) to full freshness", () => {
    expect(recencyDecayFactor(-5, 30)).toBe(1);
  });
  it("is 0 for a non-positive half-life", () => {
    expect(recencyDecayFactor(10, 0)).toBe(0);
  });
});

describe("applyRecencyDecay", () => {
  const now = new Date("2026-05-23T00:00:00Z");

  it("boosts newer results above older ones and sets recencyBoost", () => {
    const fresh = result({
      documentId: "fresh",
      chunkIndex: 0,
      score: 0.01,
      indexedAt: new Date("2026-05-23T00:00:00Z"),
    });
    const old = result({
      documentId: "old",
      chunkIndex: 0,
      score: 0.01,
      indexedAt: new Date("2025-05-23T00:00:00Z"),
    });
    const [boostedFresh, boostedOld] = applyRecencyDecay([fresh, old], {
      weight: 1,
      halfLifeDays: 30,
      now,
    });
    expect(boostedFresh.recencyBoost).toBeCloseTo(1, 6);
    expect(boostedFresh.score).toBeGreaterThan(boostedOld.score);
  });

  it("leaves results without indexedAt untouched", () => {
    const r = result({ documentId: "x", chunkIndex: 0, score: 0.5 });
    const [out] = applyRecencyDecay([r], { weight: 1, halfLifeDays: 30, now });
    expect(out.score).toBe(0.5);
    expect(out.recencyBoost).toBeUndefined();
  });
});

describe("filterResultsByDocIds", () => {
  const rows = [
    result({ documentId: "a", chunkIndex: 0 }),
    result({ documentId: "b", chunkIndex: 0 }),
    result({ documentId: "c", chunkIndex: 0 }),
  ];

  it("keeps only results whose documentId is in the allowed set", () => {
    const out = filterResultsByDocIds(rows, new Set(["a", "c"]));
    expect(out.map((r) => r.documentId)).toEqual(["a", "c"]);
  });

  it("returns nothing when the allowed set is empty", () => {
    expect(filterResultsByDocIds(rows, new Set())).toEqual([]);
  });
});

describe("combineHybridResults", () => {
  it("fuses FTS + vector by chunk key and respects the limit", () => {
    const fts = [
      result({ documentId: "d1", chunkIndex: 0 }),
      result({ documentId: "d2", chunkIndex: 0 }),
    ];
    const vector = [
      result({ documentId: "d2", chunkIndex: 0 }),
      result({ documentId: "d3", chunkIndex: 0 }),
    ];
    const out = combineHybridResults(fts, vector, { limit: 2 });
    expect(out.length).toBe(2);
    // d2 appears in both arms, so it should rank first.
    expect(out[0].documentId).toBe("d2");
    expect(out[0].sources.fts).toBeDefined();
    expect(out[0].sources.vector).toBeDefined();
  });

  it("applies recency re-ranking when weight + indexedAt are present", () => {
    const old = result({
      documentId: "old",
      chunkIndex: 0,
      indexedAt: new Date("2024-01-01T00:00:00Z"),
    });
    const fresh = result({
      documentId: "fresh",
      chunkIndex: 0,
      indexedAt: new Date("2026-05-20T00:00:00Z"),
    });
    // FTS ranks old first; recency should flip fresh to the top.
    const out = combineHybridResults([old, fresh], [], {
      limit: 2,
      recencyWeight: 1,
      recencyHalfLifeDays: 30,
      now: new Date("2026-05-23T00:00:00Z"),
    });
    expect(out[0].documentId).toBe("fresh");
  });
});
