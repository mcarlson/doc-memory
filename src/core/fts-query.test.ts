import { describe, it, expect } from "vitest";
import { sanitizeFtsQuery } from "./fts-query.js";

describe("sanitizeFtsQuery", () => {
  it("quotes each term and joins with implicit AND", () => {
    expect(sanitizeFtsQuery("hello world")).toBe('"hello" "world"');
  });

  it("neutralises FTS5 operator keywords by quoting them as literals", () => {
    // Bare AND/OR/NOT/NEAR would be operators; quoted they are plain terms.
    expect(sanitizeFtsQuery("cats OR dogs")).toBe('"cats" "OR" "dogs"');
    expect(sanitizeFtsQuery("NEAR")).toBe('"NEAR"');
  });

  it("does not throw and produces safe output for colon column filters", () => {
    // `re: hearing` would be parsed as a column filter by raw FTS5.
    expect(sanitizeFtsQuery("re: hearing")).toBe('"re" "hearing"');
  });

  it("survives unbalanced quotes", () => {
    expect(sanitizeFtsQuery('the "smith')).toBe('"the" "smith"');
  });

  it("survives punctuation-heavy queries like C++", () => {
    expect(sanitizeFtsQuery("C++")).toBe('"C"');
    expect(sanitizeFtsQuery("9:30am")).toBe('"9" "30am"');
  });

  it("preserves unicode letters and digits", () => {
    expect(sanitizeFtsQuery("café 2024")).toBe('"café" "2024"');
  });

  it("returns empty string when there are no usable tokens", () => {
    expect(sanitizeFtsQuery("")).toBe("");
    expect(sanitizeFtsQuery("   ")).toBe("");
    expect(sanitizeFtsQuery("()-*:")).toBe("");
  });
});
