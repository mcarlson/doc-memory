export interface HybridResult<T> {
  item: T;
  score: number;
  sources: { fts?: number; vector?: number };
}

export function fuseWithRRF<T>(
  ftsResults: T[],
  vectorResults: T[],
  getId: (item: T) => string,
  k = 60
): HybridResult<T>[] {
  const scores = new Map<string, HybridResult<T>>();

  ftsResults.forEach((item, index) => {
    const id = getId(item);
    const rank = index + 1;
    const entry = scores.get(id) || { item, score: 0, sources: {} };
    entry.score += 1 / (k + rank);
    entry.sources.fts = rank;
    scores.set(id, entry);
  });

  vectorResults.forEach((item, index) => {
    const id = getId(item);
    const rank = index + 1;
    const entry = scores.get(id) || { item, score: 0, sources: {} };
    entry.score += 1 / (k + rank);
    entry.sources.vector = rank;
    scores.set(id, entry);
  });

  return [...scores.values()].sort((a, b) => b.score - a.score);
}
