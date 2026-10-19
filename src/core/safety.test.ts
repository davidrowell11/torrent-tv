import { describe, expect, it } from 'vitest';
import { checkFile, checkTorrent, isTrustedTorrentUrl, MIN_VIDEO_BYTES } from './safety';

const MB = 1024 * 1024;

describe('checkFile', () => {
  it('allows videos and subtitles', () => {
    expect(checkFile({ path: 'Film/Film.mp4', length: 1 }).allowed).toBe(true);
    expect(checkFile({ path: 'Film/Film.en.srt', length: 1 }).allowed).toBe(true);
  });
  it('blocks programs, scripts and archives', () => {
    for (const p of ['setup.exe', 'codec.msi', 'run.bat', 'x.ps1', 'a.zip', 'readme.lnk', 'Film.mp4.exe', 'x.dmg', 'x.apk']) {
      expect(checkFile({ path: p, length: 1 }).allowed, p).toBe(false);
    }
  });
  it('blocks disguised double extensions and bidi tricks', () => {
    expect(checkFile({ path: 'Film.exe.mp4', length: 1 }).allowed).toBe(false);
    expect(checkFile({ path: 'Film\u202E4pm.exe', length: 1 }).allowed).toBe(false);
  });
  it('blocks path traversal', () => {
    expect(checkFile({ path: '../../evil.mp4', length: 1 }).allowed).toBe(false);
    expect(checkFile({ path: 'C:/Windows/evil.mp4', length: 1 }).allowed).toBe(false);
  });
});

describe('checkTorrent', () => {
  it('accepts a normal film torrent and skips extras', () => {
    const v = checkTorrent([
      { path: 'Film/Film.mp4', length: 900 * MB },
      { path: 'Film/Film.srt', length: 50_000 },
      { path: 'Film/Film_meta.xml', length: 1000 },
    ]);
    expect(v.ok).toBe(true);
    expect(v.files.map((f) => f.allowed)).toEqual([true, true, false]);
  });
  it('rejects a torrent whose main file is a program', () => {
    const v = checkTorrent([{ path: 'Film/Film.exe', length: 900 * MB }, { path: 'Film/sample.mp4', length: 20 * MB }]);
    expect(v.ok).toBe(false);
  });
  it('rejects tiny lure videos', () => {
    expect(checkTorrent([{ path: 'Film.mp4', length: MIN_VIDEO_BYTES - 1 }]).ok).toBe(false);
  });
  it('rejects empty torrents', () => {
    expect(checkTorrent([]).ok).toBe(false);
  });
});

describe('isTrustedTorrentUrl', () => {
  it('requires https on an allowed host', () => {
    expect(isTrustedTorrentUrl('https://archive.org/download/x/x_archive.torrent', ['archive.org'])).toBe(true);
    expect(isTrustedTorrentUrl('https://ia800.us.archive.org/x.torrent', ['archive.org'])).toBe(true);
    expect(isTrustedTorrentUrl('http://archive.org/x.torrent', ['archive.org'])).toBe(false);
    expect(isTrustedTorrentUrl('https://archive.org.evil.com/x.torrent', ['archive.org'])).toBe(false);
    expect(isTrustedTorrentUrl('https://evilarchive.org/x.torrent', ['archive.org'])).toBe(false);
  });
  it('accepts only well-formed magnets', () => {
    expect(isTrustedTorrentUrl('magnet:?xt=urn:btih:abcdef', [])).toBe(true);
    expect(isTrustedTorrentUrl('magnet:?dn=nothing', [])).toBe(false);
  });
});
