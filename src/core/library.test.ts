import { describe, expect, it } from 'vitest';
import { addTitle, keyOf, loadState, reconcile, saveState, updateEpisode } from './library';
import type { TitleInfo } from './types';

const film: TitleInfo = { tmdbId: 7, kind: 'movie', title: 'Film', overview: '' };
const show: TitleInfo = { tmdbId: 8, kind: 'tv', title: 'Show', overview: '' };

describe('library', () => {
  it('adds once and follows shows by default', () => {
    let lib = addTitle([], show);
    lib = addTitle(lib, show);
    expect(lib).toHaveLength(1);
    expect(lib[0].follow).toBe(true);
  });
  it('reconciles finished and blocked downloads', () => {
    let lib = addTitle(addTitle([], film), show);
    lib = lib.map((i) => (i.info.kind === 'movie' ? { ...i, status: 'downloading', downloadId: 'a' } : updateEpisode(i, { season: 1, episode: 1 }, { status: 'downloading', downloadId: 'b' })));
    const out = reconcile(lib, [{ id: 'a', phase: 'ready', scanNote: 'clean' }, { id: 'b', phase: 'blocked', blockedReason: 'Windows program disguised as .mp4' }]);
    expect(out.find((i) => keyOf(i.info) === 'movie:7')?.status).toBe('done');
    expect(out.find((i) => keyOf(i.info) === 'tv:8')?.episodes?.[0]).toMatchObject({ status: 'blocked', note: 'Windows program disguised as .mp4' });
    expect(reconcile(out, [])).toBe(out);
  });
  it('round-trips through storage and survives corrupt data', () => {
    const mem = new Map<string, string>();
    const storage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) };
    saveState({ library: addTitle([], film), settings: loadState(storage).settings }, storage);
    expect(loadState(storage).library).toHaveLength(1);
    mem.set('torrent-tv/state/v1', '{not json');
    expect(loadState(storage).library).toEqual([]);
  });
});
