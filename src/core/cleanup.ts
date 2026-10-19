import type { LibraryItem } from './types';

export interface CleanupPrefs {
  /** Days after watching to delete the file. -1 = never. 0 = straight away. */
  afterWatchDays: number;
  /** Also clean up films, not just episodes. */
  includeFilms: boolean;
}

export interface CleanupTarget {
  key: string;
  downloadId: string;
  season?: number;
  episode?: number;
  label: string;
}

/** Downloads that have been watched long enough ago to delete under the user's cleanup setting. */
export function dueForCleanup(lib: LibraryItem[], prefs: CleanupPrefs, keyOf: (i: LibraryItem) => string, now = new Date()): CleanupTarget[] {
  if (prefs.afterWatchDays < 0) return [];
  const old = (at?: string) => !!at && now.getTime() - new Date(at).getTime() >= prefs.afterWatchDays * 86_400_000;
  const out: CleanupTarget[] = [];
  for (const item of lib) {
    const key = keyOf(item);
    if (item.info.kind === 'movie') {
      if (prefs.includeFilms && item.watched && item.status === 'done' && item.downloadId && old(item.watchedAt)) {
        out.push({ key, downloadId: item.downloadId, label: item.info.title });
      }
      continue;
    }
    for (const e of item.episodes ?? []) {
      if (e.watched && e.status === 'done' && e.downloadId && old(e.watchedAt)) {
        out.push({ key, downloadId: e.downloadId, season: e.season, episode: e.episode, label: `${item.info.title} S${String(e.season).padStart(2, '0')}E${String(e.episode).padStart(2, '0')}` });
      }
    }
  }
  return out;
}
