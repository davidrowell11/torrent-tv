import type { TorrentEngine } from './types';

/** The desktop app exposes its torrent engine to the page through a narrow, validated bridge. */
declare global {
  interface Window {
    torrentTV?: Omit<TorrentEngine, 'kind'> & { platform: string };
  }
}

export function createDesktopEngine(): TorrentEngine | undefined {
  const bridge = window.torrentTV;
  if (!bridge) return undefined;
  return { kind: 'desktop', ...bridge };
}

/** Fetcher for Torznab feeds: through the desktop app when available (no CORS), else plain fetch. */
export function feedFetcher(engine: TorrentEngine) {
  const get = engine.httpGet;
  if (!get) return undefined;
  return async (url: string) => {
    const r = await get(url);
    return new Response(r.text, { status: r.status });
  };
}
