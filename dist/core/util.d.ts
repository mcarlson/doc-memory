/**
 * Expand a leading `~/` (or a bare `~`) to the user's home directory.
 *
 * Unlike `path.replace("~", home)`, this only touches a tilde at the *start*
 * of the path — so `/data/~backup` is left alone — and does not support
 * `~user` syntax. `home` is injectable for testing; it defaults to
 * `os.homedir()` (correct on Windows, unlike `process.env.HOME`).
 */
export declare function expandHome(p: string, home?: string): string;
/**
 * Parse JSON without throwing. Returns `undefined` on null/empty/invalid input
 * so a single corrupt row can't take down a whole list/read query.
 */
export declare function safeParseJson<T = Record<string, unknown>>(raw: string | null | undefined): T | undefined;
/**
 * L2-normalise a vector to unit length. Returns a copy (never mutates input);
 * a zero vector is returned unchanged to avoid NaN.
 */
export declare function normalizeVector(vec: number[]): number[];
//# sourceMappingURL=util.d.ts.map