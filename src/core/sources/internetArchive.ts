import type { SearchQuery, TorrentCandidate } from '../types';
import type { Fetcher, TorrentSource } from './types';

/**
 * Internet Archive (archive.org): public domain feature films, classic TV,
 * and Creative Commons works. Every item has an official torrent with HTTP
 * web seeds, so downloads work even with no other peers, including in the browser.
 */

const COLLECTIONS = ['feature_films', 'classic_tv', 'classic_cartoons', 'film_noir', 'sci-fi_horror', 'comedy_films', 'television'];

interface IaDoc {
  identifier: string;
  title?: string;
  year?: string | number;
  item_size?: number;
  licenseurl?: string;
  downloads?: number;
}

const esc = (s: string) => s.replace(/["\\:()[\]{}^~*?!+\-&|/]/g, ' ').replace(/\s+/g, ' ').trim();
const pad = (n: number) => String(n).padStart(2, '0');

export function buildIaQuery(query: SearchQuery): string {
  const title = esc(query.title);
  const parts = [`title:(${title})`, 'mediatype:movies', `collection:(${COLLECTIONS.join(' OR ')})`];
  if (query.kind === 'tv') {
    const s = query.season, e = query.episode;
    parts[0] = `(title:(${title}) AND (title:("S${pad(s)}E${pad(e)}") OR title:("${s}x${pad(e)}") OR title:("Episode ${e}")))`;
  } else if (query.year) {
    parts.push(`year:[${query.year - 1} TO ${query.year + 1}]`);
  }
  return parts.join(' AND ');
}

export function createInternetArchiveSource(fetcher: Fetcher = (u, i) => fetch(u, i)): TorrentSource {
  return {
    id: 'internet-archive',
    name: 'Internet Archive',
    description: 'Public domain films, classic TV and openly licensed video from archive.org.',
    homepage: 'https://archive.org/details/moviesandfilms',
    allowedHosts: ['archive.org'],
    supports: ['movie', 'tv'],
    async search(query, signal) {
      const params = new URLSearchParams({ q: buildIaQuery(query), rows: '10', output: 'json', sort: 'downloads desc' });
      for (const f of ['identifier', 'title', 'year', 'item_size', 'licenseurl', 'downloads']) params.append('fl[]', f);
      const res = await fetcher(`https://archive.org/advancedsearch.php?${params}`, { signal });
      if (!res.ok) throw new Error(`Internet Archive search failed (${res.status})`);
      const body = (await res.json()) as { response?: { docs?: IaDoc[] } };
      return (body.response?.docs ?? [])
        .filter((d) => /^[A-Za-z0-9._-]+$/.test(d.identifier))
        .map<TorrentCandidate>((d) => ({
          sourceId: 'internet-archive',
          torrentUrl: `https://archive.org/download/${d.identifier}/${d.identifier}_archive.torrent`,
          detailsUrl: `https://archive.org/details/${d.identifier}`,
          name: d.title ?? d.identifier,
          sizeBytes: d.item_size,
          license: d.licenseurl ?? 'Public domain (per Internet Archive)',
        }));
    },
  };
}

export interface FreeTitle {
  iaId: string;
  title: string;
  year?: number;
  thumbUrl: string;
  downloads?: number;
}

/** Most-watched public domain films and TV on Internet Archive, for the "Free classics" shelf. */
export async function browseFreeClassics(
  collection: 'feature_films' | 'classic_tv' | 'film_noir' | 'sci-fi_horror' | 'comedy_films' = 'feature_films',
  rows = 24,
  fetcher: Fetcher = (u, i) => fetch(u, i),
  signal?: AbortSignal,
): Promise<FreeTitle[]> {
  const params = new URLSearchParams({ q: `collection:(${collection}) AND mediatype:movies`, rows: String(rows), output: 'json', sort: 'downloads desc' });
  for (const f of ['identifier', 'title', 'year', 'downloads']) params.append('fl[]', f);
  const res = await fetcher(`https://archive.org/advancedsearch.php?${params}`, { signal });
  if (!res.ok) throw new Error(`Internet Archive is unavailable (${res.status})`);
  const body = (await res.json()) as { response?: { docs?: IaDoc[] } };
  return (body.response?.docs ?? [])
    .filter((d) => /^[A-Za-z0-9._-]+$/.test(d.identifier))
    .map((d) => ({
      iaId: d.identifier,
      title: d.title ?? d.identifier,
      year: d.year ? Number(String(d.year).slice(0, 4)) : undefined,
      thumbUrl: `https://archive.org/services/img/${d.identifier}`,
      downloads: d.downloads,
    }));
}

export const iaTorrentUrl = (iaId: string) => `https://archive.org/download/${iaId}/${iaId}_archive.torrent`;

/** The item's own description, as plain text (Internet Archive stores it as HTML). */
export async function fetchIaDescription(iaId: string, fetcher: Fetcher = (u, i) => fetch(u, i), signal?: AbortSignal): Promise<string | undefined> {
  if (!/^[A-Za-z0-9._-]+$/.test(iaId)) return undefined;
  const res = await fetcher(`https://archive.org/metadata/${iaId}/metadata/description`, { signal });
  if (!res.ok) return undefined;
  const body = (await res.json()) as { result?: string | string[] };
  const raw = Array.isArray(body.result) ? body.result.join('\n') : body.result;
  return raw ? htmlToText(raw) || undefined : undefined;
}

export function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>|<\/p>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n\n')
    .trim()
    .slice(0, 1200);
}
