import { describe, expect, it } from 'vitest';
import { groupByDay } from './calendar';
import { dueForCleanup } from './cleanup';
import { rankByQuality, resolutionOf } from './quality';
import { defaultSubtitleIndex, srtToVtt, subtitleLang } from './subtitles';
import { historyBody, Trakt } from './sync/trakt';
import type { LibraryItem } from './types';

describe('quality', () => {
  const c = (name: string, seeders = 10, sizeBytes?: number) => ({ sourceId: 's', torrentUrl: `magnet:?xt=urn:btih:${name}`, name, seeders, sizeBytes });
  it('reads resolutions from release names', () => {
    expect(resolutionOf('Show.S01E01.1080p.WEB')).toBe('1080p');
    expect(resolutionOf('Film 2160p UHD')).toBe('2160p');
    expect(resolutionOf('Film.720p')).toBe('720p');
    expect(resolutionOf('Film')).toBeUndefined();
  });
  it('prefers the chosen resolution, then a step down, and respects the size cap', () => {
    const list = [c('A 2160p', 500, 20e9), c('B 720p', 50), c('C 1080p', 5), c('D 1080p', 80), c('E 480p', 900)];
    expect(rankByQuality(list, { preferred: '1080p', maxSizeGB: 8 }).map((x) => x.name)).toEqual(['D 1080p', 'C 1080p', 'B 720p', 'E 480p']);
    expect(rankByQuality(list, { preferred: 'any', maxSizeGB: 0 })).toHaveLength(5);
  });
});

describe('subtitles', () => {
  it('converts SRT to WebVTT and strips unsafe markup', () => {
    const vtt = srtToVtt('﻿1\r\n00:00:01,500 --> 00:00:03,000\r\n<i>Hello</i> <font color="red">there</font><script>x</script>\r\n');
    expect(vtt.startsWith('WEBVTT\n\n')).toBe(true);
    expect(vtt).toContain('00:00:01.500 --> 00:00:03.000');
    expect(vtt).toContain('<i>Hello</i> therex');
    expect(vtt).not.toContain('<script');
  });
  it('guesses languages and picks the viewer’s', () => {
    expect(subtitleLang('Film.es.srt')).toEqual({ lang: 'es', label: 'Spanish' });
    expect(subtitleLang('Film.srt').label).toBe('Subtitles');
    expect(defaultSubtitleIndex([{ lang: 'es' }, { lang: 'en' }], 'en-GB')).toBe(1);
    expect(defaultSubtitleIndex([{ lang: 'es' }], 'de')).toBe(0);
    expect(defaultSubtitleIndex([], 'en')).toBe(-1);
  });
});

describe('calendar', () => {
  it('groups by day with Today/Tomorrow labels and drops past dates', () => {
    const today = new Date(2026, 9, 19);
    const e = (airDate: string, showTitle = 'Show', episode = 1) => ({ showKey: 'tv:1', showTitle, season: 1, episode, airDate });
    const days = groupByDay([e('2026-10-21'), e('2026-10-19', 'B'), e('2026-10-19', 'A'), e('2026-10-20'), e('2026-10-18')], today, 'en-US');
    expect(days.map((d) => d.label.slice(0, 8))).toEqual(['Today', 'Tomorrow', 'Wed, Oct']);
    expect(days[0].entries.map((x) => x.showTitle)).toEqual(['A', 'B']);
  });
});

describe('cleanup', () => {
  const now = new Date('2026-10-19T12:00:00Z');
  const lib: LibraryItem[] = [
    { info: { tmdbId: 1, kind: 'tv', title: 'Show', overview: '' }, addedAt: '', status: 'wanted', episodes: [
      { season: 1, episode: 1, status: 'done', downloadId: 'a', watched: true, watchedAt: '2026-10-10T00:00:00Z' },
      { season: 1, episode: 2, status: 'done', downloadId: 'b', watched: true, watchedAt: '2026-10-19T11:00:00Z' },
      { season: 1, episode: 3, status: 'done', downloadId: 'c' },
    ] },
    { info: { tmdbId: 2, kind: 'movie', title: 'Film', overview: '' }, addedAt: '', status: 'done', downloadId: 'd', watched: true, watchedAt: '2026-10-01T00:00:00Z' },
  ];
  const key = (i: LibraryItem) => `${i.info.kind}:${i.info.tmdbId}`;
  it('deletes only watched files past the delay', () => {
    expect(dueForCleanup(lib, { afterWatchDays: 7, includeFilms: false }, key, now).map((t) => t.downloadId)).toEqual(['a']);
    expect(dueForCleanup(lib, { afterWatchDays: 0, includeFilms: true }, key, now).map((t) => t.downloadId)).toEqual(['a', 'b', 'd']);
    expect(dueForCleanup(lib, { afterWatchDays: -1, includeFilms: true }, key, now)).toEqual([]);
  });
});

describe('trakt', () => {
  it('builds history bodies grouped by show and season', () => {
    const body = historyBody([
      { kind: 'movie', tmdbId: 9, watchedAt: 't' },
      { kind: 'episode', tmdbId: 5, season: 1, episode: 2, watchedAt: 't' },
      { kind: 'episode', tmdbId: 5, season: 1, episode: 3, watchedAt: 't' },
    ]);
    expect(body.movies).toEqual([{ ids: { tmdb: 9 }, watched_at: 't' }]);
    expect(body.shows).toEqual([{ ids: { tmdb: 5 }, seasons: [{ number: 1, episodes: [{ number: 2, watched_at: 't' }, { number: 3, watched_at: 't' }] }] }]);
  });
  it('completes device sign-in after the user approves', async () => {
    const replies = [new Response('', { status: 400 }), new Response(JSON.stringify({ access_token: 'A', refresh_token: 'R', expires_in: 7776000 })), new Response(JSON.stringify({ user: { username: 'david' } }))];
    let saved: unknown;
    const t = new Trakt({ clientId: 'id', clientSecret: 'secret' }, (a) => (saved = a), async () => replies.shift()!);
    const auth = await t.finishDeviceLogin({ device_code: 'd', user_code: 'U', verification_url: 'https://trakt.tv/activate', expires_in: 600, interval: 1 }, undefined, async () => {});
    expect(auth).toMatchObject({ accessToken: 'A', refreshToken: 'R', username: 'david' });
    expect(saved).toBe(auth);
  });
});
