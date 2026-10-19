import { fetchIaDescription } from '../sources/internetArchive';
import type { TitleInfo } from '../types';
import type { Omdb } from './omdb';
import type { Tmdb } from './tmdb';

/**
 * Fill in everything we can find about a title: TMDB for artwork, info and age rating,
 * OMDb for IMDb and Rotten Tomatoes scores, Internet Archive's own description as a last resort.
 * Each source is optional; a failing one never loses what the others found.
 */
export async function enrichTitle(info: TitleInfo, src: { tmdb?: Tmdb; omdb?: Omdb }, signal?: AbortSignal): Promise<TitleInfo> {
  let out = { ...info };
  if (src.tmdb) {
    try {
      const full = info.tmdbId ? await src.tmdb.details(info.kind, info.tmdbId, signal) : await src.tmdb.match(info.kind, info.title, info.year, signal);
      if (full) {
        out = {
          ...out, ...full,
          // Keep the identity the library already uses for this title.
          tmdbId: info.tmdbId, iaId: info.iaId,
          posterUrl: full.posterUrl ?? info.posterUrl,
          overview: full.overview || info.overview,
        };
      }
    } catch (e) {
      if (signal?.aborted) throw e;
    }
  }
  if (src.omdb) {
    try {
      const o = out.imdbId ? await src.omdb.byImdbId(out.imdbId, signal) : await src.omdb.byTitle(out.kind, out.title, out.year, signal);
      if (o) {
        out = {
          ...out,
          imdbId: out.imdbId ?? o.imdbId,
          imdbRating: o.imdbRating ?? out.imdbRating,
          rottenTomatoes: o.rottenTomatoes ?? out.rottenTomatoes,
          certification: out.certification ?? o.certification,
          overview: out.overview || o.plot || '',
        };
      }
    } catch (e) {
      if (signal?.aborted) throw e;
    }
  }
  if (!out.overview && out.iaId) {
    try {
      out.overview = (await fetchIaDescription(out.iaId, undefined, signal)) ?? '';
    } catch (e) {
      if (signal?.aborted) throw e;
    }
  }
  return out;
}
