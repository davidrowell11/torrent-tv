import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { getEngine, feedFetcher, type DownloadInfo, type VpnStatus } from '../core/engine';
import { episodesToFetch, isCheckDue } from '../core/follow';
import {
  addTitle, defaultSettings, epCode, keyOf, loadState, reconcile, removeTitle, saveState, updateEpisode, updateTitle,
  type AppState, type Settings,
} from '../core/library';
import { Tmdb } from '../core/metadata/tmdb';
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
  toasts: Toast[];
  toast(text: string, tone?: Toast['tone']): void;
  add(info: TitleInfo): void;
  remove(key: string): void;
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

export function StoreProvider({ children }: { children: ReactNode }) {
  const engine = useMemo(() => getEngine(), []);
  const [state, setState] = useState<AppState>(() => loadState());
  const [downloads, setDownloads] = useState<DownloadInfo[]>([]);
  const [vpn, setVpn] = useState<VpnStatus>({ supported: false, connected: false, killSwitchActive: false });
  const [scanner, setScanner] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
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
    (query: SearchQuery) => findTorrents(query, sources, (id) => ref.current.settings.enabledSources[id] !== false),
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
    if (!tmdb) return;
    try {
      const full = info.tmdbId ? await tmdb.details(info.kind, info.tmdbId) : await tmdb.match(info.kind, info.title, info.year);
      if (!full) return;
      const key = keyOf(info);
      const merged: TitleInfo = {
        ...info, ...full,
        // Keep the identity the library already uses for this title.
        tmdbId: info.tmdbId, iaId: info.iaId,
        posterUrl: full.posterUrl ?? info.posterUrl,
        overview: full.overview || info.overview,
      };
      ref.current = { ...ref.current, library: updateTitle(ref.current.library, key, (i) => ({ ...i, info: merged })) };
      patchItem(key, (i) => ({ ...i, info: merged }));
    } catch {
      // Artwork is nice to have; the title still works without it.
    }
  };

  // Fill in artwork/info for anything added before a TMDB key was set.
  useEffect(() => {
    if (!tmdb) return;
    ref.current.library.filter((i) => !i.info.backdropUrl || !i.info.genres).forEach((i) => enrich(i.info));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tmdb]);

  const value: Store = {
    state,
    downloads,
    vpn,
    scanner,
    engine,
    engineKind: engine.kind,
    tmdb,
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
    remove: (key) => setState((s) => ({ ...s, library: removeTitle(s.library, key) })),
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
