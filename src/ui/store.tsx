import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { getEngine, feedFetcher, type DownloadInfo, type PlayableMedia, type VpnStatus } from '../core/engine';
import { dueForCleanup } from '../core/cleanup';
import { notify } from '../core/notify';
import { rankByQuality } from '../core/quality';
import { episodeId, Trakt, type WatchedEvent } from '../core/sync/trakt';
import { episodesToFetch, isCheckDue } from '../core/follow';
import {
  addTitle, defaultSettings, epCode, keyOf, loadState, reconcile, removeTitle, saveState, updateEpisode, updateTitle,
  type AppState, type Settings,
} from '../core/library';
import { Tmdb } from '../core/metadata/tmdb';
import { Omdb } from '../core/metadata/omdb';
import { enrichTitle } from '../core/metadata/enrich';
import { iaTorrentUrl } from '../core/sources/internetArchive';
import { allSources, findTorrents } from '../core/sources/registry';
import type { DownloadMeta, EpisodeRef, LibraryEpisode, LibraryItem, SearchQuery, TitleInfo, TorrentCandidate } from '../core/types';

export interface Toast {
  id: number;
  tone: 'info' | 'good' | 'warn';
  text: string;
}

interface Store {
  state: AppState;
  downloads: DownloadInfo[];
  vpn: VpnStatus;
  scanner: string | null;
  engineKind: 'browser' | 'desktop';
  tmdb?: Tmdb;
  omdb?: Omdb;
  toasts: Toast[];
  toast(text: string, tone?: Toast['tone']): void;
  add(info: TitleInfo): void;
  /** Remove from the library; optionally delete its downloaded files too. */
  remove(key: string, deleteFiles?: boolean): Promise<void>;
  /** Delete a downloaded film or episode from this device; it stays in the library. */
  deleteDownload(key: string, ep?: EpisodeRef): Promise<void>;
  setWatched(key: string, ep: EpisodeRef | undefined, watched: boolean): void;
  savePosition(key: string, ep: EpisodeRef | undefined, seconds: number, duration: number): void;
  mediaFor(key: string, ep?: EpisodeRef): Promise<PlayableMedia | undefined>;
  trakt?: Trakt;
  syncTrakt(): Promise<void>;
  storageUsed: number;
  nowPlaying?: NowPlaying;
  /** Open the built-in player for a downloaded film or episode. */
  play(key: string, ep?: EpisodeRef): Promise<void>;
  closePlayer(): void;
  setFollow(key: string, on: boolean, fromStart?: boolean): void;
  get(key: string, ep?: EpisodeRef, candidate?: TorrentCandidate): Promise<void>;
  findCandidates(query: SearchQuery): Promise<TorrentCandidate[]>;
  checkNow(key?: string): Promise<void>;
  updateSettings(patch: Partial<Settings>): void;
  engine: ReturnType<typeof getEngine>;
}

const Ctx = createContext<Store | null>(null);
export const useStore = () => {
  const s = useContext(Ctx);
  if (!s) throw new Error('StoreProvider missing');
  return s;
};

const sourceHosts = (sourceId: string, settings: Settings) =>
  allSources(settings.customSources).find((s) => s.id === sourceId)?.allowedHosts ?? [];

export interface NowPlaying {
  key: string;
  ep?: EpisodeRef;
  title: string;
  subtitle?: string;
  media: PlayableMedia;
  resumeAt?: LibraryItem['position'];
}

const findEp = (item: LibraryItem | undefined, ep: EpisodeRef) =>
  item?.episodes?.find((e) => e.season === ep.season && e.episode === ep.episode);

export function StoreProvider({ children }: { children: ReactNode }) {
  const engine = useMemo(() => getEngine(), []);
  const [state, setState] = useState<AppState>(() => loadState());
  const [downloads, setDownloads] = useState<DownloadInfo[]>([]);
  const [vpn, setVpn] = useState<VpnStatus>({ supported: false, connected: false, killSwitchActive: false });
  const [scanner, setScanner] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [storageUsed, setStorageUsed] = useState(0);
  const [nowPlaying, setNowPlaying] = useState<NowPlaying>();
  /** Downloads already seen as ready, so a notification fires once per new file (not for old ones at startup). */
  const announced = useRef<Set<string> | null>(null);
  const ref = useRef(state);
  ref.current = state;
  const downloadsRef = useRef(downloads);
  downloadsRef.current = downloads;

  useEffect(() => saveState(state), [state]);

  const toast = useCallback((text: string, tone: Toast['tone'] = 'info') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, text, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4500);
  }, []);

  const tmdb = useMemo(() => (state.settings.tmdbKey ? new Tmdb(state.settings.tmdbKey) : undefined), [state.settings.tmdbKey]);
  const omdb = useMemo(() => (state.settings.omdbKey ? new Omdb(state.settings.omdbKey) : undefined), [state.settings.omdbKey]);
  const sources = useMemo(
    () => allSources(state.settings.customSources, feedFetcher(engine)),
    [state.settings.customSources, engine],
  );

  // Push safety settings to the engine whenever they change.
  useEffect(() => {
    engine.setRequireVpn(state.settings.requireVpn);
    engine.setRequireScan(state.settings.requireVirusScan);
  }, [engine, state.settings.requireVpn, state.settings.requireVirusScan]);

  // Poll downloads and safety status.
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      const [list, v, sc] = await Promise.all([engine.list(), engine.vpn(), engine.scanner()]);
      if (!alive) return;
      setDownloads(list);
      setVpn(v);
      setScanner(sc);
      const ready = list.filter((d) => d.phase === 'ready');
      if (!announced.current) announced.current = new Set(ready.map((d) => d.id));
      for (const d of ready) {
        if (announced.current.has(d.id)) continue;
        announced.current.add(d.id);
        if (ref.current.settings.notifications) notify('Ready to watch', d.label);
      }
      engine.storageUsed().then((n) => alive && setStorageUsed(n)).catch(() => {});
      setState((s) => {
        const lib = reconcile(s.library, list);
        return lib === s.library ? s : { ...s, library: lib };
      });
    };
    tick();
    const t = setInterval(tick, 1500);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [engine]);

  const patchItem = (key: string, fn: (i: LibraryItem) => LibraryItem) =>
    setState((s) => ({ ...s, library: updateTitle(s.library, key, fn) }));

  const findCandidates = useCallback(
    async (query: SearchQuery) =>
      rankByQuality(await findTorrents(query, sources, (id) => ref.current.settings.enabledSources[id] !== false), ref.current.settings.quality),
    [sources],
  );

  const get = useCallback(
    async (key: string, ep?: EpisodeRef, chosen?: TorrentCandidate) => {
      const item = ref.current.library.find((i) => keyOf(i.info) === key);
      if (!item) return;
      const setStatus = (patch: Partial<LibraryItem>) =>
        patchItem(key, (i) => (ep ? updateEpisode(i, ep, patch as never) : { ...i, ...patch }));
      const label = ep ? `${item.info.title} ${epCode(ep)}` : item.info.title;
      setStatus({ status: 'searching', note: undefined });
      try {
        let pick = chosen;
        if (!pick && item.info.iaId && !ep) {
          pick = { sourceId: 'internet-archive', torrentUrl: iaTorrentUrl(item.info.iaId), name: item.info.title };
        }
        if (!pick) {
          const query: SearchQuery = ep
            ? { kind: 'tv', title: item.info.title, year: item.info.year, season: ep.season, episode: ep.episode }
            : { kind: 'movie', title: item.info.title, year: item.info.year };
          [pick] = await findCandidates(query);
        }
        if (!pick) {
          setStatus({ status: 'not-found', note: "No trusted source has this yet. We'll keep checking." });
          return;
        }
        const info = ref.current.library.find((i) => keyOf(i.info) === key)?.info ?? item.info;
        const epInfo = ep && item.episodes?.find((e) => e.season === ep.season && e.episode === ep.episode);
        const meta: DownloadMeta = {
          title: info.title, kind: info.kind, year: info.year, overview: info.overview, rating: info.rating, genres: info.genres,
          posterUrl: info.posterUrl, backdropUrl: info.backdropUrl, tmdbId: info.tmdbId || undefined,
          ...(ep ? { season: ep.season, episode: ep.episode, episodeTitle: ep.title ?? epInfo?.title, airDate: ep.airDate ?? epInfo?.airDate } : {}),
        };
        const downloadId = await engine.add(pick.torrentUrl, label, sourceHosts(pick.sourceId, ref.current.settings), meta);
        setStatus({ status: 'downloading', downloadId });
        toast(`Downloading ${label}`, 'good');
      } catch (err) {
        setStatus({ status: 'not-found', note: err instanceof Error ? err.message : String(err) });
      }
    },
    [engine, findCandidates, toast],
  );

  const checkNow = useCallback(
    async (onlyKey?: string) => {
      if (!tmdb) return;
      const items = ref.current.library.filter(
        (i) => i.info.kind === 'tv' && i.follow && i.info.tmdbId && (onlyKey ? keyOf(i.info) === onlyKey : isCheckDue(i, ref.current.settings.checkEveryHours)),
      );
      for (const item of items) {
        const key = keyOf(item.info);
        try {
          const aired = await tmdb.airedEpisodes(item.info.tmdbId);
          const { start, wanted } = episodesToFetch(item, aired);
          patchItem(key, (i) => {
            let next: LibraryItem = { ...i, followFrom: i.followFrom ?? start, lastCheckedAt: new Date().toISOString() };
            for (const ep of wanted) {
              // Episodes no source had last time go back in the queue to be tried again.
              const retry: Partial<LibraryEpisode> = i.episodes?.find((x) => x.season === ep.season && x.episode === ep.episode)?.status === 'not-found' ? { status: 'wanted' } : {};
              next = updateEpisode(next, ep, { title: ep.title, airDate: ep.airDate, ...retry });
            }
            return next;
          });
          if (wanted.length) toast(`${wanted.length} new episode${wanted.length > 1 ? 's' : ''} of ${item.info.title}`, 'good');
        } catch (err) {
          toast(`Couldn't check ${item.info.title}: ${err instanceof Error ? err.message : err}`, 'warn');
        }
      }
    },
    [tmdb, toast],
  );

  // Background loop: look for new episodes on schedule and start queued downloads within the limit.
  useEffect(() => {
    const run = async () => {
      await checkNow();
      const s = ref.current;
      const active = downloadsRef.current.filter((d) => d.phase === 'downloading' || d.phase === 'checking').length;
      let slots = s.settings.maxActive - active;
      // Only shows the user follows are fetched automatically; everything else waits for a click.
      for (const item of s.library.filter((i) => i.follow)) {
        for (const ep of item.episodes ?? []) {
          if (slots <= 0) return;
          if (ep.status === 'wanted') {
            slots--;
            await get(keyOf(item.info), ep);
          }
        }
      }
    };
    run();
    const t = setInterval(run, 60_000);
    return () => clearInterval(t);
  }, [checkNow, get]);
  /** Make sure every title in the library has full artwork and info, not just what a search result carried. */
  const enrich = async (info: TitleInfo) => {
    if (!tmdb && !omdb && !info.iaId) return;
    try {
      const merged = await enrichTitle(info, { tmdb, omdb });
      const key = keyOf(info);
      ref.current = { ...ref.current, library: updateTitle(ref.current.library, key, (i) => ({ ...i, info: merged })) };
      patchItem(key, (i) => ({ ...i, info: merged }));
    } catch {
      // Artwork is nice to have; the title still works without it.
    }
  };

  // Fill in artwork, info and scores for anything added before a key was set.
  useEffect(() => {
    ref.current.library
      .filter((i) => !i.info.overview || (tmdb && (!i.info.backdropUrl || !i.info.genres || !i.info.certification)) || (omdb && !i.info.imdbRating))
      .forEach((i) => enrich(i.info));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tmdb, omdb]);

  const trakt = useMemo(() => {
    const a = state.settings.trakt;
    if (!a?.clientId || !a.accessToken) return undefined;
    return new Trakt(a, (auth) => setState((s) => ({ ...s, settings: { ...s.settings, trakt: auth } })));
    // Recreate only when the account changes, not on every token refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.settings.trakt?.clientId, state.settings.trakt?.username, !!state.settings.trakt?.accessToken]);

  const watchEvent = (item: LibraryItem, ep: EpisodeRef | undefined, at: string): WatchedEvent | undefined => {
    if (!item.info.tmdbId) return undefined; // Trakt matches by TMDB id
    return ep
      ? { kind: 'episode', tmdbId: item.info.tmdbId, season: ep.season, episode: ep.episode, watchedAt: at }
      : { kind: 'movie', tmdbId: item.info.tmdbId, watchedAt: at };
  };

  const setWatched = (key: string, ep: EpisodeRef | undefined, watched: boolean) => {
    const item = ref.current.library.find((i) => keyOf(i.info) === key);
    if (!item) return;
    const at = new Date().toISOString();
    const patch = { watched, watchedAt: watched ? at : undefined, ...(watched ? {} : { position: undefined }) };
    patchItem(key, (i) => (ep ? updateEpisode(i, ep, patch) : { ...i, ...patch }));
    const ev = watchEvent(item, ep, at);
    if (trakt && ev) (watched ? trakt.addToHistory([ev]) : trakt.removeFromHistory([ev])).catch((e) => toast(String(e.message ?? e), 'warn'));
  };

  const deleteDownload = async (key: string, ep?: EpisodeRef) => {
    const item = ref.current.library.find((i) => keyOf(i.info) === key);
    const id = ep ? findEp(item, ep)?.downloadId : item?.downloadId;
    if (id) await engine.deleteFiles(id);
    const patch = { status: 'removed' as const, downloadId: undefined, note: 'Deleted from this device', position: undefined };
    patchItem(key, (i) => (ep ? updateEpisode(i, ep, patch) : { ...i, ...patch }));
  };

  const syncTrakt = async () => {
    if (!trakt) return;
    try {
      const h = await trakt.watched();
      let marked = 0;
      setState((s) => ({
        ...s,
        library: s.library.map((item) => {
          const id = item.info.tmdbId;
          if (!id) return item;
          if (item.info.kind === 'movie') {
            if (h.movies.has(id) && !item.watched) { marked++; return { ...item, watched: true, watchedAt: new Date().toISOString() }; }
            return item;
          }
          const eps = item.episodes?.map((e) => {
            if (e.watched || !h.episodes.has(episodeId(id, e.season, e.episode))) return e;
            marked++;
            return { ...e, watched: true, watchedAt: new Date().toISOString() };
          });
          return eps ? { ...item, episodes: eps } : item;
        }),
      }));
      toast(marked ? `Synced with Trakt: ${marked} marked watched` : 'Synced with Trakt', 'good');
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'warn');
    }
  };

  // Storage cleanup: delete files watched longer ago than the user's setting (checked every few minutes).
  useEffect(() => {
    const run = async () => {
      for (const t of dueForCleanup(ref.current.library, ref.current.settings.cleanup, (i) => keyOf(i.info))) {
        await deleteDownload(t.key, t.season !== undefined ? { season: t.season, episode: t.episode! } : undefined);
        toast(`Cleaned up ${t.label} (watched)`, 'info');
      }
    };
    run();
    const id = setInterval(run, 5 * 60_000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine]);

  // Pull watched history from Trakt when connected.
  useEffect(() => {
    if (trakt) syncTrakt();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trakt]);

  const value: Store = {
    state,
    downloads,
    vpn,
    scanner,
    engine,
    engineKind: engine.kind,
    tmdb,
    omdb,
    toasts,
    toast,
    add: (info) => {
      // Update the ref right away so a download started in the same click can find the item.
      ref.current = { ...ref.current, library: addTitle(ref.current.library, info) };
      setState((s) => ({ ...s, library: addTitle(s.library, info) }));
      enrich(info);
      toast(info.kind === 'tv' ? `Following ${info.title}. New episodes will download automatically.` : `Added ${info.title}`, 'good');
      if (info.kind === 'tv') setTimeout(() => checkNow(keyOf(info)), 50);
    },
    remove: async (key, deleteFiles) => {
      const item = ref.current.library.find((i) => keyOf(i.info) === key);
      const ids = [item?.downloadId, ...(item?.episodes ?? []).map((e) => e.downloadId)].filter((x): x is string => !!x);
      for (const id of ids) {
        const ready = downloadsRef.current.find((d) => d.id === id)?.phase === 'ready';
        // Unfinished downloads are always cancelled; finished files are kept (still listed under Downloads) unless asked.
        if (deleteFiles || !ready) await engine.deleteFiles(id).catch(() => {});
      }
      setState((s) => ({ ...s, library: removeTitle(s.library, key) }));
    },
    deleteDownload,
    setWatched,
    savePosition: (key, ep, seconds, duration) => {
      if (!duration || !Number.isFinite(duration)) return;
      const position = { seconds, duration, updatedAt: new Date().toISOString() };
      patchItem(key, (i) => (ep ? updateEpisode(i, ep, { position }) : { ...i, position }));
      const item = ref.current.library.find((i) => keyOf(i.info) === key);
      const already = ep ? findEp(item, ep)?.watched : item?.watched;
      if (!already && seconds / duration >= 0.9) setWatched(key, ep, true);
    },
    mediaFor: async (key, ep) => {
      const item = ref.current.library.find((i) => keyOf(i.info) === key);
      const id = ep ? findEp(item, ep)?.downloadId : item?.downloadId;
      return id ? engine.media(id) : undefined;
    },
    trakt,
    syncTrakt,
    storageUsed,
    nowPlaying,
    play: async (key, ep) => {
      const item = ref.current.library.find((i) => keyOf(i.info) === key);
      const id = ep ? findEp(item, ep)?.downloadId : item?.downloadId;
      const media = id ? await engine.media(id) : undefined;
      if (!item || !media) {
        toast("That file isn't on this device anymore.", 'warn');
        return;
      }
      const e = ep && findEp(item, ep);
      setNowPlaying({
        key, ep, media,
        title: item.info.title,
        subtitle: ep ? `${epCode(ep)}${e?.title ? ` · ${e.title}` : ''}` : item.info.year ? String(item.info.year) : undefined,
        resumeAt: ep ? e?.position : item.position,
      });
    },
    closePlayer: () => setNowPlaying(undefined),
    setFollow: (key, on, fromStart) => {
      patchItem(key, (i) => ({ ...i, follow: on, ...(fromStart ? { followFrom: { season: 1, episode: 1 }, lastCheckedAt: undefined } : {}) }));
      if (on) setTimeout(() => checkNow(key), 50);
    },
    get,
    findCandidates,
    checkNow,
    updateSettings: (patch) => setState((s) => ({ ...s, settings: { ...defaultSettings, ...s.settings, ...patch } })),
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
