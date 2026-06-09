import { describe, it, expect } from "vitest";
import { expandHome, safeParseJson, normalizeVector } from "./util.js";

describe("expandHome", () => {
  it("expands a bare ~ to the home directory", () => {
    expect(expandHome("~", "/home/alice")).toBe("/home/alice");
  });

  it("expands a leading ~/ to the home directory", () => {
    expect(expandHome("~/.doc-memory/index.db", "/home/alice")).toBe(
      "/home/alice/.doc-memory/index.db",
    );
  });

  it("does NOT touch a ~ that is not at the start (regression)", () => {
    expect(expandHome("/data/~backup/index.db", "/home/alice")).toBe(
      "/data/~backup/index.db",
    );
  });

  it("does not expand ~user style paths", () => {
    expect(expandHome("~bob/notes", "/home/alice")).toBe("~bob/notes");
  });

  it("leaves absolute and relative paths untouched", () => {
    expect(expandHome("/abs/path", "/home/alice")).toBe("/abs/path");
    expect(expandHome("rel/path", "/home/alice")).toBe("rel/path");
  });
});

describe("safeParseJson", () => {
  it("parses valid JSON objects", () => {
    expect(safeParseJson('{"a":1}')).toEqual({ a: 1 });
  });

  it("returns undefined for malformed JSON instead of throwing", () => {
    expect(safeParseJson("{not json")).toBeUndefined();
  });

  it("returns undefined for null/empty input", () => {
    expect(safeParseJson(null)).toBeUndefined();
    expect(safeParseJson(undefined)).toBeUndefined();
    expect(safeParseJson("")).toBeUndefined();
  });
});

describe("normalizeVector", () => {
  it("returns a unit vector", () => {
    const out = normalizeVector([3, 4]);
    expect(out[0]).toBeCloseTo(0.6, 10);
    expect(out[1]).toBeCloseTo(0.8, 10);
  });

  it("returns a copy of the zero vector unchanged (no NaN)", () => {
    const out = normalizeVector([0, 0, 0]);
    expect(out).toEqual([0, 0, 0]);
  });

  it("does not mutate the input", () => {
    const input = [3, 4];
    normalizeVector(input);
    expect(input).toEqual([3, 4]);
  });
});
