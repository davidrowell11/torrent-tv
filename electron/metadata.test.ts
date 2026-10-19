import { describe, expect, it } from 'vitest';
import { episodeNfo, movieNfo, sanitizeMeta, showNfo } from './metadata';

describe('artwork and info files', () => {
  it('writes escaped, player-readable .nfo files', () => {
    const m = { title: 'Tom & Jerry <Classic>', kind: 'movie' as const, year: 1940, overview: 'Cat "vs" mouse', rating: 7.9, genres: ['Comedy'], tmdbId: 12 };
    const nfo = movieNfo(m);
    expect(nfo).toContain('<title>Tom &amp; Jerry &lt;Classic&gt;</title>');
    expect(nfo).toContain('<plot>Cat &quot;vs&quot; mouse</plot>');
    expect(nfo).toContain('<uniqueid type="tmdb" default="true">12</uniqueid>');
    expect(showNfo({ ...m, kind: 'tv' })).toContain('<tvshow>');
    expect(episodeNfo({ ...m, kind: 'tv', season: 2, episode: 5, episodeTitle: 'Pilot' })).toMatch(/<season>2<\/season>[\s\S]*<episode>5<\/episode>/);
  });
  it('accepts only well-formed metadata from the page', () => {
    expect(sanitizeMeta(null)).toBeUndefined();
    expect(sanitizeMeta({ title: 'X', kind: 'game' })).toBeUndefined();
    const m = sanitizeMeta({ title: 'X', kind: 'movie', year: '1999', genres: ['A', 5], evil: 'payload' });
    expect(m).toMatchObject({ title: 'X', kind: 'movie', year: undefined, genres: ['A'] });
    expect(m).not.toHaveProperty('evil');
  });
});
