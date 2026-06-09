/**
 * Build a safe SQLite FTS5 `MATCH` expression from arbitrary user input.
 *
 * FTS5 interprets its MATCH argument as a query *expression*, not a literal
 * string: bare words like AND/OR/NOT/NEAR are operators, `:` introduces a
 * column filter, `"` starts a phrase, and unbalanced or stray syntax raises
 * `SQLITE_ERROR: fts5: syntax error`. Passing a raw user query there (e.g.
 * `re: hearing`, `C++`, `the "smith`) crashes the search tool.
 *
 * This mirrors the intent of the main app's `sanitizeFtsQuery`
 * (api-server/src/lib/text-utils.ts), but targets the SQLite FTS5 dialect
 * rather than Postgres `tsquery`. doc-memory is a standalone, separately
 * published package, so the logic lives here rather than crossing the
 * app/package boundary.
 *
 * Strategy: extract alphanumeric tokens (dropping all operators/punctuation),
 * wrap each as an FTS5 string literal (which neutralises keyword operators),
 * and AND them together with spaces — preserving the original implicit-AND
 * semantics. Returns "" when there are no usable tokens; callers should skip
 * the FTS query entirely in that case.
 */
export function sanitizeFtsQuery(raw: string): string {
  if (!raw) return "";
  const tokens = raw.match(/[\p{L}\p{N}]+/gu);
  if (!tokens) return "";
  return tokens.map((t) => `"${t}"`).join(" ");
}
