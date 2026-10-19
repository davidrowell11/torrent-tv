import { describe, expect, it } from 'vitest';
import { episodesToFetch, isCheckDue } from './follow';
import type { LibraryItem } from './types';

const show = (patch: Partial<LibraryItem> = {}): LibraryItem => ({
  info: { tmdbId: 1, kind: 'tv', title: 'Show', overview: '' },
  addedAt: '2026-01-01T00:00:00Z', status: 'wanted', follow: true, episodes: [], ...patch,
});
const aired = [
  { season: 1, episode: 1 }, { season: 1, episode: 2 }, { season: 2, episode: 1 }, { season: 2, episode: 2 },
];

describe('episodesToFetch', () => {
  it('follows from now on by default: nothing old is fetched', () => {
    const { start, wanted } = episodesToFetch(show(), aired);
    expect(start).toEqual({ season: 2, episode: 3 });
    expect(wanted).toEqual([]);
  });
  it('fetches episodes that aired after following', () => {
    const { wanted } = episodesToFetch(show({ followFrom: { season: 2, episode: 2 } }), [...aired, { season: 2, episode: 3 }]);
    expect(wanted.map((e) => `${e.season}x${e.episode}`)).toEqual(['2x2', '2x3']);
  });
  it('backfills from the start when asked and skips ones already handled', () => {
    const item = show({ followFrom: { season: 1, episode: 1 }, episodes: [{ season: 1, episode: 1, status: 'done' }, { season: 1, episode: 2, status: 'not-found' }] });
    expect(episodesToFetch(item, aired).wanted.map((e) => `${e.season}x${e.episode}`)).toEqual(['1x2', '2x1', '2x2']);
  });
});

describe('isCheckDue', () => {
  it('respects the interval and the follow flag', () => {
    const now = new Date('2026-05-01T12:00:00Z');
    expect(isCheckDue(show(), 6, now)).toBe(true);
    expect(isCheckDue(show({ lastCheckedAt: '2026-05-01T08:00:00Z' }), 6, now)).toBe(false);
    expect(isCheckDue(show({ lastCheckedAt: '2026-05-01T05:00:00Z' }), 6, now)).toBe(true);
    expect(isCheckDue(show({ follow: false }), 6, now)).toBe(false);
  });
});
