import { describe, expect, it } from 'vitest';
import { verifyContent } from './sniff';

const bytes = (...parts: (string | number[])[]) =>
  new Uint8Array(parts.flatMap((p) => (typeof p === 'string' ? [...p].map((c) => c.charCodeAt(0)) : p)).concat(Array(48).fill(0)));

describe('verifyContent', () => {
  it('accepts real containers', () => {
    expect(verifyContent('a.mp4', bytes([0, 0, 0, 0x20], 'ftypisom')).ok).toBe(true);
    expect(verifyContent('a.mkv', bytes([0x1a, 0x45, 0xdf, 0xa3])).ok).toBe(true);
    expect(verifyContent('a.avi', bytes('RIFF', [0, 0, 0, 0], 'AVI ')).ok).toBe(true);
    expect(verifyContent('a.ogv', bytes('OggS')).ok).toBe(true);
    expect(verifyContent('a.srt', new TextEncoder().encode('1\n00:00:01,000 --> 00:00:02,000\nHello\n')).ok).toBe(true);
  });
  it('catches programs disguised as video', () => {
    const r = verifyContent('movie.mp4', bytes('MZ', [0x90, 0]));
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/Windows program/);
    expect(verifyContent('movie.mkv', bytes([0x7f], 'ELF')).ok).toBe(false);
    expect(verifyContent('movie.mp4', bytes('PK', [3, 4])).ok).toBe(false);
  });
  it('rejects files whose content does not match the extension', () => {
    expect(verifyContent('movie.mp4', bytes([0x1a, 0x45, 0xdf, 0xa3])).ok).toBe(false);
    expect(verifyContent('movie.mkv', bytes('hello world')).ok).toBe(false);
  });
  it('rejects subtitles carrying scripts', () => {
    expect(verifyContent('a.srt', new TextEncoder().encode('<script>alert(1)</script>')).ok).toBe(false);
  });
});
