import { defaultQuality, type QualityPrefs } from './quality';
import type { CleanupPrefs } from './cleanup';
import type { TorznabConfig } from './sources/torznab';
import type { TraktAuth } from './sync/trakt';
import type { EpisodeRef, LibraryEpisode, LibraryItem, LibraryItemStatus, TitleInfo } from './types';

/** Everything the app remembers between sessions. Stored locally only. */
export interface AppState {
  library: LibraryItem[];
  settings: Settings;
}

export interface Settings {
  tmdbKey: string;
  /** Optional OMDb key for IMDb and Rotten Tomatoes scores. */
  omdbKey?: string;
  enabledSources: Record<string, boolean>;
  /** Desktop: pause all torrents when no VPN connection is detected. */
  requireVpn: boolean;
  /** Desktop: keep files in quarantine until an antivirus has scanned them. */
  requireVirusScan: boolean;
  checkEveryHours: number;
  /** Max torrents running at once. */
  maxActive: number;
  /** Torznab feeds the user added (Prowlarr, Jackett, etc). */
  customSources: TorznabConfig[];
  quality: QualityPrefs;
  cleanup: CleanupPrefs;
  /** Show a device notification when a new download is ready to watch. */
  notifications: boolean;
  /** Optional Trakt sync of watched history. */
  trakt?: TraktAuth;
}

const isPhone = () => typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse) and (max-width: 900px)').matches;

export const defaultSettings: Settings = {
  tmdbKey: '',
  enabledSources: { 'internet-archive': true },
  requireVpn: true,
  requireVirusScan: true,
  checkEveryHours: 6,
  maxActive: 2,
  customSources: [],
  quality: defaultQuality(isPhone()),
  cleanup: { afterWatchDays: -1, includeFilms: false },
  notifications: false,
};

export const keyOf = (info: Pick<TitleInfo, 'kind' | 'tmdbId' | 'iaId'>) =>
  info.tmdbId ? `${info.kind}:${info.tmdbId}` : `ia:${info.iaId}`;
export const epCode = (e: EpisodeRef) => `S${String(e.season).padStart(2, '0')}E${String(e.episode).padStart(2, '0')}`;

export function addTitle(lib: LibraryItem[], info: TitleInfo, now = new Date()): LibraryItem[] {
  if (lib.some((i) => keyOf(i.info) === keyOf(info))) return lib;
  const item: LibraryItem = {
    info,
    addedAt: now.toISOString(),
    status: 'wanted',
    ...(info.kind === 'tv' ? { follow: true, episodes: [] } : {}),
  };
  return [item, ...lib];
}

export function removeTitle(lib: LibraryItem[], key: string): LibraryItem[] {
  return lib.filter((i) => keyOf(i.info) !== key);
}

export function updateTitle(lib: LibraryItem[], key: string, patch: (i: LibraryItem) => LibraryItem): LibraryItem[] {
  return lib.map((i) => (keyOf(i.info) === key ? patch(i) : i));
}

export function updateEpisode(item: LibraryItem, ref: EpisodeRef, patch: Partial<LibraryEpisode>): LibraryItem {
  const episodes = [...(item.episodes ?? [])];
  const idx = episodes.findIndex((e) => e.season === ref.season && e.episode === ref.episode);
  if (idx >= 0) episodes[idx] = { ...episodes[idx], ...patch };
  else episodes.push({ ...ref, status: 'wanted', ...patch });
  episodes.sort((a, b) => a.season - b.season || a.episode - b.episode);
  return { ...item, episodes };
}

const STORAGE_KEY = 'torrent-tv/state/v1';

export function loadState(storage: Pick<Storage, 'getItem'> = localStorage): AppState {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<AppState>;
      return { library: parsed.library ?? [], settings: { ...defaultSettings, ...parsed.settings } };
    }
  } catch {
    // Corrupt or unavailable storage: start fresh rather than crash.
  }
  return { library: [], settings: defaultSettings };
}

export function saveState(state: AppState, storage: Pick<Storage, 'setItem'> = localStorage) {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Private mode / quota: the app still works for this session.
  }
}

/** Fold download progress back into the library so statuses survive restarts. */
export function reconcile(
  lib: LibraryItem[],
  downloads: { id: string; phase: string; blockedReason?: string; error?: string; scanNote?: string }[],
): LibraryItem[] {
  const byId = new Map(downloads.map((d) => [d.id, d]));
  const next = (status: LibraryItemStatus, id?: string): { status: LibraryItemStatus; note?: string } | undefined => {
    const d = id ? byId.get(id) : undefined;
    // A finished file the engine no longer has was deleted outside the app (or the browser cleared it).
    if (status === 'done' && id && !d) return { status: 'removed', note: 'No longer on this device' };
    // Interrupted (app closed mid-download): queue it again rather than leave it stuck.
    if (status === 'downloading' && id && !d) return { status: 'wanted', note: 'Download was interrupted' };
    if (!d || (status !== 'downloading' && status !== 'searching')) return undefined;
    if (d.phase === 'ready') return { status: 'done', note: d.scanNote };
    if (d.phase === 'blocked') return { status: 'blocked', note: d.blockedReason };
    if (d.error) return { status: 'blocked', note: d.error };
    return undefined;
  };
  let changed = false;
  const out = lib.map((item) => {
    let copy = item;
    const top = next(item.status, item.downloadId);
    if (top) copy = { ...copy, ...top };
    if (item.episodes?.length) {
      const eps = item.episodes.map((e) => {
        const u = next(e.status, e.downloadId);
        return u ? { ...e, ...u } : e;
      });
      if (eps.some((e, i) => e !== item.episodes![i])) copy = { ...copy, episodes: eps };
    }
    if (copy !== item) changed = true;
    return copy;
  });
  return changed ? out : lib;
}
