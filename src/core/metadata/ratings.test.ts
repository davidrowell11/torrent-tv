import { describe, expect, it } from 'vitest';
import { htmlToText } from '../sources/internetArchive';
import type { Fetcher } from '../sources/types';
import { enrichTitle } from './enrich';
import { Omdb, parseOmdb } from './omdb';
import { certificationOf, Tmdb } from './tmdb';

const json = (body: unknown): ReturnType<Fetcher> => Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));

describe('age ratings', () => {
  it('reads the US film certification, skipping blank entries', () => {
    expect(certificationOf({ release_dates: { results: [
      { iso_3166_1: 'GB', release_dates: [{ certification: '15' }] },
      { iso_3166_1: 'US', release_dates: [{ certification: '' }, { certification: 'R' }] },
    ] } })).toBe('R');
  });
  it('reads the US TV rating', () => {
    expect(certificationOf({ content_ratings: { results: [{ iso_3166_1: 'US', rating: 'TV-MA' }] } })).toBe('TV-MA');
  });
  it('returns nothing when there is no US rating', () => {
    expect(certificationOf({ release_dates: { results: [{ iso_3166_1: 'DE', release_dates: [{ certification: '16' }] }] } })).toBeUndefined();
  });
});

describe('OMDb scores', () => {
  it('parses IMDb and Rotten Tomatoes', () => {
    expect(parseOmdb({
      Response: 'True', imdbID: 'tt0111161', imdbRating: '9.3', Rated: 'R', Plot: 'Two men.',
      Ratings: [{ Source: 'Internet Movie Database', Value: '9.3/10' }, { Source: 'Rotten Tomatoes', Value: '89%' }],
    })).toEqual({ imdbId: 'tt0111161', imdbRating: 9.3, rottenTomatoes: 89, certification: 'R', plot: 'Two men.' });
  });
  it('ignores N/A and "Not Rated"', () => {
    expect(parseOmdb({ Response: 'True', imdbRating: 'N/A', Rated: 'Not Rated', Plot: 'N/A' })).toEqual({
      imdbId: undefined, imdbRating: undefined, rottenTomatoes: undefined, certification: undefined, plot: undefined,
    });
  });
  it('reports a bad key', async () => {
    const omdb = new Omdb('bad', () => json({ Response: 'False', Error: 'Invalid API key!' }));
    await expect(omdb.byImdbId('tt1')).rejects.toThrow(/key/);
  });
});

describe('enrichTitle', () => {
  const classic = { tmdbId: 0, iaId: 'sex_madness', kind: 'movie' as const, title: 'Sex Madness', year: 1938, overview: '' };

  it('combines TMDB info with OMDb scores', async () => {
    const tmdb = new Tmdb('k', (url) => url.includes('/search/')
      ? json({ results: [{ id: 7 }] })
      : json({ id: 7, title: 'Sex Madness', overview: 'A cautionary tale.', imdb_id: 'tt0030719',
        release_dates: { results: [{ iso_3166_1: 'US', release_dates: [{ certification: 'Approved' }] }] } }));
    const seen: string[] = [];
    const omdb = new Omdb('k', (url) => { seen.push(url); return json({ Response: 'True', imdbRating: '3.2', Ratings: [] }); });
    const out = await enrichTitle(classic, { tmdb, omdb });
    expect(out).toMatchObject({ tmdbId: 0, iaId: 'sex_madness', overview: 'A cautionary tale.', certification: 'Approved', imdbRating: 3.2 });
    expect(seen[0]).toContain('i=tt0030719');
  });

  it('falls back to the OMDb plot when TMDB has none', async () => {
    const omdb = new Omdb('k', () => json({ Response: 'True', Plot: 'From OMDb.', Rated: 'PG' }));
    expect(await enrichTitle({ ...classic, iaId: undefined }, { omdb })).toMatchObject({ overview: 'From OMDb.', certification: 'PG' });
  });

  it('keeps going when a source fails', async () => {
    const tmdb = new Tmdb('k', () => Promise.reject(new Error('offline')));
    const omdb = new Omdb('k', () => json({ Response: 'True', imdbRating: '6.1' }));
    expect(await enrichTitle({ ...classic, iaId: undefined }, { tmdb, omdb })).toMatchObject({ imdbRating: 6.1 });
  });
});

describe('htmlToText', () => {
  it('strips tags and entities', () => {
    expect(htmlToText('<p>A <b>1938</b> film&nbsp;about &amp; more.</p><p>Second</p>')).toBe('A 1938 film about & more.\nSecond');
  });
});
