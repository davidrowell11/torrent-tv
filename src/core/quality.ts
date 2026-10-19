import type { TorrentCandidate } from './types';

export type Resolution = '480p' | '720p' | '1080p' | '2160p';
export interface QualityPrefs {
  /** 'any' means take the best-seeded release. */
  preferred: Resolution | 'any';
  /** Skip anything bigger than this. 0 = no limit. */
  maxSizeGB: number;
}

const ORDER: Resolution[] = ['480p', '720p', '1080p', '2160p'];

export function resolutionOf(name: string): Resolution | undefined {
  const n = name.toLowerCase();
  if (/2160p|\b4k\b|\buhd\b/.test(n)) return '2160p';
  if (/1080[pi]/.test(n)) return '1080p';
  if (/720p/.test(n)) return '720p';
  if (/480p|576p|\bsd\b|dvdrip/.test(n)) return '480p';
  return undefined;
}

/**
 * Order candidates by the user's quality preference: drop ones over the size cap,
 * then prefer the exact resolution, then the closest one below it, then above.
 * Seeders break ties. Releases with no stated resolution sit in the middle.
 */
export function rankByQuality(cands: TorrentCandidate[], prefs: QualityPrefs): TorrentCandidate[] {
  const cap = prefs.maxSizeGB > 0 ? prefs.maxSizeGB * 1e9 : Infinity;
  const allowed = cands.filter((c) => !c.sizeBytes || c.sizeBytes <= cap);
  if (prefs.preferred === 'any') return allowed;
  const want = ORDER.indexOf(prefs.preferred);
  const distance = (c: TorrentCandidate) => {
    const r = resolutionOf(c.name);
    if (!r) return 1.5;
    const d = ORDER.indexOf(r) - want;
    return d === 0 ? 0 : d < 0 ? -d : d + 2; // a step down beats a step up (smaller files)
  };
  return allowed
    .map((c, i) => ({ c, i, d: distance(c) }))
    .sort((a, b) => a.d - b.d || (b.c.seeders ?? 0) - (a.c.seeders ?? 0) || a.i - b.i)
    .map((x) => x.c);
}

/** Phones get a lighter default so downloads fit in memory and storage. */
export function defaultQuality(isPhone: boolean): QualityPrefs {
  return isPhone ? { preferred: '720p', maxSizeGB: 2 } : { preferred: '1080p', maxSizeGB: 8 };
}
