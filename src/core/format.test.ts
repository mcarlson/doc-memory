import { describe, it, expect } from "vitest";
import { z } from "zod";
import {
  formatSearchResults,
  formatPageRange,
  formatDocumentList,
  formatErrorMessage,
} from "./format.js";
import type { SearchResult, Document } from "../types.js";

function result(p: Partial<SearchResult> & { documentId: string }): SearchResult {
  return {
    filename: "f.md",
    content: "body",
    chunkIndex: 0,
    score: 0.1,
    sources: {},
    ...p,
  };
}

describe("formatSearchResults", () => {
  it("returns a friendly message when empty", () => {
    expect(formatSearchResults([])).toBe("No results found.");
  });

  it("numbers results and labels their source arms", () => {
    const out = formatSearchResults([
      result({ documentId: "d1", filename: "a.md", sources: { fts: 1, vector: 2 } }),
    ]);
    expect(out).toContain("[1] a.md (chunk 0)");
    expect(out).toContain("FTS:#1");
    expect(out).toContain("Vec:#2");
  });
});

describe("formatPageRange", () => {
  it("formats a real range", () => {
    expect(formatPageRange([2, 5])).toBe("Pages 2-5");
  });
  it("reports unknown when absent", () => {
    expect(formatPageRange(undefined)).toBe("Unknown pages");
  });
});

describe("formatDocumentList", () => {
  const doc = (filename: string): Document => ({
    id: filename,
    source: "directory",
    filename,
    contentHash: "h",
    indexedAt: new Date("2026-05-23T10:00:00Z"),
  });

  it("reports empty state", () => {
    expect(formatDocumentList([])).toBe("No documents indexed.");
  });

  it("lists documents with ISO date", () => {
    const out = formatDocumentList([doc("a.md")]);
    expect(out).toContain("# Indexed Documents (1)");
    expect(out).toContain("- a.md (directory, indexed 2026-05-23)");
  });
});

describe("formatErrorMessage", () => {
  it("maps a ZodError to a friendly invalid-arguments message", () => {
    const schema = z.object({ limit: z.number().int().positive() });
    const err = (() => {
      try {
        schema.parse({ limit: -1 });
      } catch (e) {
        return e;
      }
    })();
    const msg = formatErrorMessage(err);
    expect(msg).toContain("Invalid arguments");
    expect(msg).toContain("limit");
  });

  it("uses the message of a plain Error", () => {
    expect(formatErrorMessage(new Error("boom"))).toBe("boom");
  });

  it("stringifies non-error values", () => {
    expect(formatErrorMessage("nope")).toBe("nope");
  });
});
