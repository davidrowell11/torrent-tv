import { buildMedia } from './media';
import type { TorrentEngine } from './types';

interface Bridge extends Omit<TorrentEngine, 'kind' | 'media'> {
  platform: string;
  /** Video URL on the app's private media scheme plus subtitle texts. */
  mediaInfo(id: string): Promise<{ videoUrl: string; subtitles: { name: string; text: string }[] } | null>;
}

/** The desktop app exposes its torrent engine to the page through a narrow, validated bridge. */
declare global {
  interface Window {
    torrentTV?: Bridge;
  }
}

export function createDesktopEngine(): TorrentEngine | undefined {
  const bridge = window.torrentTV;
  if (!bridge) return undefined;
  const { mediaInfo, platform: _platform, ...rest } = bridge;
  return {
    kind: 'desktop',
    ...rest,
    async media(id) {
      const m = await mediaInfo(id);
      return m ? buildMedia(m.videoUrl, m.subtitles) : undefined;
    },
  };
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
