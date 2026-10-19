import type { EpisodeRef, LibraryItem } from './types';

/**
 * Which aired episodes of a followed show still need fetching.
 *
 * By default a show is followed "from now on": when first checked, everything
 * already aired is recorded as the starting point and only later episodes are
 * fetched. Users can pick an earlier starting episode to backfill.
 */
export function episodesToFetch(item: LibraryItem, aired: EpisodeRef[]): { start: { season: number; episode: number }; wanted: EpisodeRef[] } {
  const latest = aired[aired.length - 1];
  const start = item.followFrom ?? (latest ? { season: latest.season, episode: latest.episode + 1 } : { season: 1, episode: 1 });
  const known = new Set(
    (item.episodes ?? []).filter((e) => e.status !== 'wanted' && e.status !== 'not-found').map((e) => `${e.season}x${e.episode}`),
  );
  const wanted = aired.filter(
    (e) => (e.season > start.season || (e.season === start.season && e.episode >= start.episode)) && !known.has(`${e.season}x${e.episode}`),
  );
  return { start, wanted };
}

export function isCheckDue(item: LibraryItem, everyHours: number, now = new Date()): boolean {
  if (!item.follow) return false;
  if (!item.lastCheckedAt) return true;
  return now.getTime() - new Date(item.lastCheckedAt).getTime() >= everyHours * 3600_000;
}
