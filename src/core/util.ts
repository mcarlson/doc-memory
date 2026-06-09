import { homedir } from "os";
import { join } from "path";

/**
 * Expand a leading `~/` (or a bare `~`) to the user's home directory.
 *
 * Unlike `path.replace("~", home)`, this only touches a tilde at the *start*
 * of the path — so `/data/~backup` is left alone — and does not support
 * `~user` syntax. `home` is injectable for testing; it defaults to
 * `os.homedir()` (correct on Windows, unlike `process.env.HOME`).
 */
export function expandHome(p: string, home: string = homedir()): string {
  if (p === "~") return home;
  if (p.startsWith("~/")) return join(home, p.slice(2));
  return p;
}

/**
 * Parse JSON without throwing. Returns `undefined` on null/empty/invalid input
 * so a single corrupt row can't take down a whole list/read query.
 */
export function safeParseJson<T = Record<string, unknown>>(
  raw: string | null | undefined,
): T | undefined {
  if (raw == null || raw === "") return undefined;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return undefined;
  }
}

/**
 * L2-normalise a vector to unit length. Returns a copy (never mutates input);
 * a zero vector is returned unchanged to avoid NaN.
 */
export function normalizeVector(vec: number[]): number[] {
  let sumSq = 0;
  for (const v of vec) sumSq += v * v;
  const norm = Math.sqrt(sumSq);
  if (norm === 0) return vec.slice();
  return vec.map((v) => v / norm);
}
