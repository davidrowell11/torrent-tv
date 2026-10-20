import { keyOf } from '../library';
import type { LibraryItem, TitleInfo } from '../types';

/** The library titles to base recommendations on: most recently watched or added first. */
export function recommendationSeeds(library: LibraryItem[], max = 6): TitleInfo[] {
  const recency = (i: LibraryItem) => i.position?.updatedAt ?? i.addedAt;
  return library
    .filter((i) => i.info.tmdbId > 0)
    .sort((a, b) => recency(b).localeCompare(recency(a)))
    .slice(0, max)
    .map((i) => i.info);
}

/**
 * Combine several "people also liked" lists into one row: take the top pick from each list in
 * turn so no single title dominates, skip duplicates and anything already in the library.
 */
export function mergeRecommendations(lists: TitleInfo[][], exclude: Set<string>, limit = 24): TitleInfo[] {
  const out: TitleInfo[] = [];
  const seen = new Set(exclude);
  for (let rank = 0; out.length < limit && lists.some((l) => rank < l.length); rank++) {
    for (const list of lists) {
      const t = list[rank];
      if (!t || seen.has(keyOf(t))) continue;
      seen.add(keyOf(t));
      out.push(t);
      if (out.length === limit) break;
    }
  }
  return out;
}
