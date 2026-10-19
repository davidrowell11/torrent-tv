import type { SearchQuery, TorrentCandidate } from '../types';
import type { Fetcher, TorrentSource } from './types';

/**
 * A source the user adds themselves: any indexer that speaks the standard
 * Torznab API (the same feeds Sonarr and Radarr use, typically via a local
 * Prowlarr or Jackett). Nothing is preconfigured; the user decides what to
 * connect and is responsible for what they download.
 *
 * Results from user sources go through every safety check the built-in ones
 * do, plus a minimum-seeders bar, since well-seeded releases are far less
 * likely to be fakes.
 */
export interface TorznabConfig {
  id: string;
  name: string;
  /** e.g. http://localhost:9696/1/api (Prowlarr) or https://indexer.example/api */
  url: string;
  apiKey: string;
  minSeeders: number;
}

export function validateTorznabUrl(raw: string): string | undefined {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return 'Not a valid URL';
  }
  const local = ['localhost', '127.0.0.1', '::1', '[::1]'].includes(u.hostname);
  if (u.protocol !== 'https:' && !(u.protocol === 'http:' && local)) return 'Use https (plain http is only allowed for this computer)';
  if (u.username || u.password) return 'Put the API key in its own field, not in the URL';
  return undefined;
}

const decode = (s: string) =>
  s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, '&')
    .trim();

/** Parse a Torznab RSS response. Kept dependency-free so it runs in browser, Node and tests alike. */
export function parseTorznab(xml: string, sourceId: string): TorrentCandidate[] {
  const items = xml.match(/<item[\s>][\s\S]*?<\/item>/g) ?? [];
  return items.flatMap((item) => {
    const tag = (name: string) => item.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`))?.[1];
    const attr = (name: string) => item.match(new RegExp(`<torznab:attr[^>]*name="${name}"[^>]*value="([^"]*)"`))?.[1];
    const enclosure = item.match(/<enclosure[^>]*url="([^"]+)"/)?.[1];
    const magnet = attr('magneturl');
    const link = magnet ?? enclosure ?? tag('link');
    const title = tag('title');
    if (!link || !title) return [];
    const size = Number(attr('size') ?? tag('size'));
    const seeders = Number(attr('seeders'));
    return [{
      sourceId,
      name: decode(title),
      torrentUrl: decode(link),
      sizeBytes: Number.isFinite(size) ? size : undefined,
      seeders: Number.isFinite(seeders) ? seeders : undefined,
      detailsUrl: tag('comments') ? decode(tag('comments')!) : undefined,
    }];
  });
}

export function createTorznabSource(cfg: TorznabConfig, fetcher: Fetcher = (u, i) => fetch(u, i)): TorrentSource {
  const base = new URL(cfg.url);
  return {
    id: cfg.id,
    name: cfg.name,
    description: 'Torznab feed you added. Not vetted by Vidora.',
    homepage: base.origin,
    // Indexer managers proxy downloads through themselves, so only that host (or magnets) is trusted.
    allowedHosts: [base.hostname],
    supports: ['movie', 'tv'],
    async search(query: SearchQuery, signal?: AbortSignal) {
      const u = new URL(cfg.url);
      u.searchParams.set('apikey', cfg.apiKey);
      u.searchParams.set('q', query.title);
      if (query.kind === 'tv') {
        u.searchParams.set('t', 'tvsearch');
        u.searchParams.set('season', String(query.season));
        u.searchParams.set('ep', String(query.episode));
      } else {
        u.searchParams.set('t', 'movie');
        if (query.year) u.searchParams.set('year', String(query.year));
      }
      const res = await fetcher(u.toString(), { signal });
      if (!res.ok) throw new Error(`${cfg.name}: search failed (${res.status})`);
      return parseTorznab(await res.text(), cfg.id).filter((c) => (c.seeders ?? 0) >= cfg.minSeeders);
    },
  };
}
