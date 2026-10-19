import type { MediaKind } from '../types';
import type { Fetcher } from '../sources/types';

const API = 'https://www.omdbapi.com/';

export interface OmdbInfo {
  imdbId?: string;
  imdbRating?: number;
  rottenTomatoes?: number;
  certification?: string;
  plot?: string;
}

interface OmdbBody {
  Response: 'True' | 'False';
  Error?: string;
  imdbID?: string;
  imdbRating?: string;
  Rated?: string;
  Plot?: string;
  Ratings?: { Source: string; Value: string }[];
}

/**
 * OMDb client for IMDb and Rotten Tomatoes scores. Users bring their own free key
 * (https://www.omdbapi.com/apikey.aspx).
 */
export class Omdb {
  constructor(private key: string, private fetcher: Fetcher = (u, i) => fetch(u, i)) {}

  private async get(params: Record<string, string>, signal?: AbortSignal): Promise<OmdbInfo | undefined> {
    const url = new URL(API);
    for (const [k, v] of Object.entries({ ...params, apikey: this.key, plot: 'short' })) url.searchParams.set(k, v);
    const res = await this.fetcher(url.toString(), { signal });
    if (res.status === 401) throw new Error('OMDb rejected the API key. Check it in Settings.');
    if (!res.ok) throw new Error(`OMDb request failed (${res.status})`);
    const body = (await res.json()) as OmdbBody;
    if (body.Response === 'False') {
      if (/api key/i.test(body.Error ?? '')) throw new Error('OMDb rejected the API key. Check it in Settings.');
      return undefined;
    }
    return parseOmdb(body);
  }

  byImdbId(imdbId: string, signal?: AbortSignal) {
    return this.get({ i: imdbId }, signal);
  }

  byTitle(kind: MediaKind, title: string, year?: number, signal?: AbortSignal) {
    const params: Record<string, string> = { t: title.replace(/\(\d{4}\)|\[.*?\]/g, '').trim(), type: kind === 'tv' ? 'series' : 'movie' };
    if (year) params.y = String(year);
    return this.get(params, signal);
  }
}

const NA = (v?: string) => (!v || v === 'N/A' ? undefined : v);

export function parseOmdb(b: OmdbBody): OmdbInfo {
  const rt = b.Ratings?.find((r) => r.Source === 'Rotten Tomatoes')?.Value;
  const imdb = Number(NA(b.imdbRating));
  const rated = NA(b.Rated);
  return {
    imdbId: NA(b.imdbID),
    imdbRating: Number.isFinite(imdb) && imdb > 0 ? imdb : undefined,
    rottenTomatoes: rt && /^\d+%$/.test(rt) ? Number(rt.slice(0, -1)) : undefined,
    // "Not Rated" and "Unrated" say nothing useful.
    certification: rated && !/^(not rated|unrated)$/i.test(rated) ? rated : undefined,
    plot: NA(b.Plot),
  };
}
