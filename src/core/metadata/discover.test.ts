import { describe, expect, it } from 'vitest';
import { defaultFilters, discoverParams, newReleaseParams } from './discover';

const today = new Date('2026-10-19T12:00:00Z');

describe('discover filters', () => {
  it('defaults to popular, already-released films', () => {
    expect(discoverParams(defaultFilters, 1, today)).toMatchObject({ sort_by: 'popularity.desc', 'primary_release_date.lte': '2026-10-19', page: '1', include_adult: 'false' });
  });
  it('maps every filter for TV', () => {
    const p = discoverParams({ kind: 'tv', genreId: 18, year: '2010s', minRating: 7, language: 'ko', sort: 'top' }, 3, today);
    expect(p).toMatchObject({
      sort_by: 'vote_average.desc', with_genres: '18', with_original_language: 'ko', 'vote_average.gte': '7',
      'first_air_date.gte': '2010-01-01', 'first_air_date.lte': '2019-12-31', 'vote_count.gte': '200', page: '3',
    });
  });
  it('"This year" and "Newest" never show unreleased titles', () => {
    const p = discoverParams({ ...defaultFilters, year: 'this', sort: 'newest' }, 1, today);
    expect(p).toMatchObject({ 'primary_release_date.gte': '2026-01-01', 'primary_release_date.lte': '2026-10-19', sort_by: 'primary_release_date.desc' });
  });
  it('new releases cover the recent window', () => {
    expect(newReleaseParams('movie', today)).toMatchObject({ 'primary_release_date.gte': '2026-07-21', 'primary_release_date.lte': '2026-10-19' });
    expect(newReleaseParams('tv', today)).toMatchObject({ 'first_air_date.gte': '2026-08-20' });
  });
});
