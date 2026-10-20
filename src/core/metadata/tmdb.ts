import type { EpisodeRef, MediaKind, TitleInfo } from '../types';
import { discoverParams, newReleaseParams, type DiscoverFilters } from './discover';
import type { Fetcher } from '../sources/types';

const API = 'https://api.themoviedb.org/3';
const IMG = 'https://image.tmdb.org/t/p';

/**
 * TMDB client for artwork and details. Users bring their own free key
 * (https://www.themoviedb.org/settings/api); either the short v3 "API key"
 * or the long v4 "read access token" works.
 */
export class Tmdb {
  constructor(private key: string, private fetcher: Fetcher = (u, i) => fetch(u, i)) {}

  private async get<T>(path: string, params: Record<string, string> = {}, signal?: AbortSignal): Promise<T> {
    const url = new URL(API + path);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    const headers: Record<string, string> = { accept: 'application/json' };
    if (this.key.length > 40) headers.authorization = `Bearer ${this.key}`;
    else url.searchParams.set('api_key', this.key);
    const res = await this.fetcher(url.toString(), { headers, signal });
    if (res.status === 401) throw new Error('TMDB rejected the API key. Check it in Settings.');
    if (!res.ok) throw new Error(`TMDB request failed (${res.status})`);
    return res.json() as Promise<T>;
  }

  async search(text: string, signal?: AbortSignal): Promise<TitleInfo[]> {
    const body = await this.get<{ results: TmdbResult[] }>('/search/multi', { query: text, include_adult: 'false' }, signal);
    return body.results.filter((r) => r.media_type === 'movie' || r.media_type === 'tv').map((r) => toInfo(r, r.media_type as MediaKind));
  }

  async genres(kind: MediaKind, signal?: AbortSignal): Promise<{ id: number; name: string }[]> {
    return (await this.get<{ genres: { id: number; name: string }[] }>(`/genre/${kind}/list`, {}, signal)).genres;
  }

  /** Browse with filters. Returns one page plus whether more pages exist. */
  async discover(f: DiscoverFilters, page = 1, signal?: AbortSignal): Promise<{ results: TitleInfo[]; more: boolean }> {
    const body = await this.get<{ results: TmdbResult[]; page: number; total_pages: number }>(`/discover/${f.kind}`, discoverParams(f, page), signal);
    return { results: body.results.map((r) => toInfo(r, f.kind)), more: body.page < Math.min(body.total_pages, 500) };
  }

  /** Films released, or shows that premiered, in the last couple of months. */
  async newReleases(kind: MediaKind, signal?: AbortSignal): Promise<TitleInfo[]> {
    const body = await this.get<{ results: TmdbResult[] }>(`/discover/${kind}`, newReleaseParams(kind), signal);
    return body.results.map((r) => toInfo(r, kind));
  }

  /** Shows with an episode airing in the next week. */
  async airingThisWeek(signal?: AbortSignal): Promise<TitleInfo[]> {
    const body = await this.get<{ results: TmdbResult[] }>('/tv/on_the_air', {}, signal);
    return body.results.map((r) => toInfo(r, 'tv'));
  }

  async trending(kind: MediaKind | 'all' = 'all', signal?: AbortSignal): Promise<TitleInfo[]> {
    const body = await this.get<{ results: TmdbResult[] }>(`/trending/${kind}/week`, {}, signal);
    return body.results
      .filter((r) => (r.media_type ?? kind) === 'movie' || (r.media_type ?? kind) === 'tv')
      .map((r) => toInfo(r, (r.media_type ?? kind) as MediaKind));
  }

  /** Titles TMDB recommends to people who liked this one. */
  async recommendations(kind: MediaKind, id: number, signal?: AbortSignal): Promise<TitleInfo[]> {
    const body = await this.get<{ results: TmdbResult[] }>(`/${kind}/${id}/recommendations`, {}, signal);
    return body.results
      .filter((r) => (r.media_type ?? kind) === 'movie' || (r.media_type ?? kind) === 'tv')
      .map((r) => toInfo(r, (r.media_type ?? kind) as MediaKind));
  }

  /** Best TMDB match for a title we only know by name (e.g. an Internet Archive film). */
  async match(kind: MediaKind, title: string, year?: number, signal?: AbortSignal): Promise<TitleInfo | undefined> {
    const params: Record<string, string> = { query: title.replace(/\(\d{4}\)|\[.*?\]/g, '').trim(), include_adult: 'false' };
    if (year) params[kind === 'movie' ? 'year' : 'first_air_date_year'] = String(year);
    const body = await this.get<{ results: TmdbResult[] }>(`/search/${kind}`, params, signal);
    const hit = body.results[0];
    return hit ? this.details(kind, hit.id, signal) : undefined;
  }

  /** Full record, including the US age rating and the IMDb id. */
  async details(kind: MediaKind, id: number, signal?: AbortSignal): Promise<TitleInfo> {
    const extra = kind === 'movie' ? 'release_dates,external_ids' : 'content_ratings,external_ids';
    const r = await this.get<TmdbResult>(`/${kind}/${id}`, { append_to_response: extra }, signal);
    return { ...toInfo(r, kind), certification: certificationOf(r), imdbId: r.imdb_id ?? r.external_ids?.imdb_id ?? undefined };
  }

  /** Episodes airing from today on (the rest of the current or next season). */
  async upcomingEpisodes(id: number, today = new Date(), signal?: AbortSignal): Promise<EpisodeRef[]> {
    const show = await this.get<{ next_episode_to_air?: { season_number: number } | null }>(`/tv/${id}`, {}, signal);
    const next = show.next_episode_to_air;
    if (!next) return [];
    const season = await this.get<{ episodes: { episode_number: number; name: string; air_date: string | null }[] }>(
      `/tv/${id}/season/${next.season_number}`, {}, signal,
    );
    const from = today.toISOString().slice(0, 10);
    return season.episodes
      .filter((e) => e.air_date && e.air_date >= from)
      .map((e) => ({ season: next.season_number, episode: e.episode_number, title: e.name, airDate: e.air_date! }));
  }

  /** Every episode of a show that has already aired, oldest first. */
  async airedEpisodes(id: number, today = new Date(), signal?: AbortSignal): Promise<EpisodeRef[]> {
    const show = await this.get<{ seasons: { season_number: number }[] }>(`/tv/${id}`, {}, signal);
    const cutoff = today.toISOString().slice(0, 10);
    const out: EpisodeRef[] = [];
    for (const { season_number } of show.seasons) {
      if (season_number === 0) continue; // specials
      const season = await this.get<{ episodes: { episode_number: number; name: string; air_date: string | null }[] }>(
        `/tv/${id}/season/${season_number}`, {}, signal,
      );
      for (const ep of season.episodes) {
        if (ep.air_date && ep.air_date <= cutoff) {
          out.push({ season: season_number, episode: ep.episode_number, title: ep.name, airDate: ep.air_date });
        }
      }
    }
    return out;
  }
}

interface TmdbResult {
  id: number;
  media_type?: string;
  title?: string;
  name?: string;
  overview?: string;
  release_date?: string;
  first_air_date?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  vote_average?: number;
  genres?: { name: string }[];
  imdb_id?: string | null;
  external_ids?: { imdb_id?: string | null };
  release_dates?: { results: { iso_3166_1: string; release_dates: { certification: string }[] }[] };
  content_ratings?: { results: { iso_3166_1: string; rating: string }[] };
}

/** US age rating (G, PG, PG-13, R, NC-17, TV-Y … TV-MA), if TMDB has one. */
export function certificationOf(r: Pick<TmdbResult, 'release_dates' | 'content_ratings'>): string | undefined {
  const us = r.release_dates?.results.find((x) => x.iso_3166_1 === 'US');
  const film = us?.release_dates.map((d) => d.certification.trim()).find(Boolean);
  const tv = r.content_ratings?.results.find((x) => x.iso_3166_1 === 'US')?.rating.trim();
  return film || tv || undefined;
}

function toInfo(r: TmdbResult, kind: MediaKind): TitleInfo {
  const date = r.release_date || r.first_air_date;
  return {
    tmdbId: r.id,
    kind,
    title: r.title ?? r.name ?? 'Untitled',
    year: date ? Number(date.slice(0, 4)) : undefined,
    overview: r.overview ?? '',
    posterUrl: r.poster_path ? `${IMG}/w500${r.poster_path}` : undefined,
    backdropUrl: r.backdrop_path ? `${IMG}/w1280${r.backdrop_path}` : undefined,
    rating: r.vote_average ? Math.round(r.vote_average * 10) / 10 : undefined,
    genres: r.genres?.map((g) => g.name),
  };
}
