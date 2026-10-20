import { describe, expect, it } from 'vitest';
import type { LibraryItem, TitleInfo } from '../types';
import { mergeRecommendations, recommendationSeeds } from './recommend';

const t = (id: number, kind: 'movie' | 'tv' = 'movie'): TitleInfo => ({ tmdbId: id, kind, title: `T${id}`, overview: '' });
const item = (info: TitleInfo, addedAt: string, watchedAt?: string): LibraryItem =>
  ({ info, addedAt, status: 'wanted', position: watchedAt ? { seconds: 1, duration: 2, updatedAt: watchedAt } : undefined }) as LibraryItem;

describe('recommendations', () => {
  it('takes turns between lists, skipping duplicates and owned titles', () => {
    const owned = new Set(['movie:3']);
    const out = mergeRecommendations([[t(1), t(2), t(3)], [t(1), t(4)], [t(3), t(5, 'tv')]], owned);
    expect(out.map((x) => x.tmdbId)).toEqual([1, 2, 4, 5]);
  });
  it('stops at the limit', () => {
    expect(mergeRecommendations([[t(1), t(2)], [t(3), t(4)]], new Set(), 3)).toHaveLength(3);
  });
  it('seeds from the most recently watched or added titles that have TMDB info', () => {
    const lib = [item(t(1), '2026-01-01'), item(t(2), '2026-02-01'), item(t(3), '2026-01-01', '2026-03-01'), item({ ...t(0), iaId: 'x' }, '2026-04-01')];
    expect(recommendationSeeds(lib, 2).map((x) => x.tmdbId)).toEqual([3, 2]);
  });
});
