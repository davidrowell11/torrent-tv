import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Saves a title's artwork and info next to the video: poster.jpg, fanart.jpg and
 * a Kodi-style .nfo file, which Plex, Jellyfin, Kodi and Emby all read. Images are
 * only fetched from the artwork hosts the app uses and must really be images.
 */

export interface Meta {
  title: string;
  kind: 'movie' | 'tv';
  year?: number;
  overview?: string;
  rating?: number;
  genres?: string[];
  posterUrl?: string;
  backdropUrl?: string;
  tmdbId?: number;
  season?: number;
  episode?: number;
  episodeTitle?: string;
  airDate?: string;
}

const IMAGE_HOSTS = ['image.tmdb.org', 'archive.org'];
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

const text = (v: unknown, max = 4000) => (typeof v === 'string' ? v.slice(0, max) : undefined);
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

/** Accept only the expected fields with the expected types from the page. */
export function sanitizeMeta(raw: unknown): Meta | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  const title = text(r.title, 300);
  if (!title || (r.kind !== 'movie' && r.kind !== 'tv')) return undefined;
  return {
    title, kind: r.kind,
    year: num(r.year), overview: text(r.overview), rating: num(r.rating),
    genres: Array.isArray(r.genres) ? r.genres.slice(0, 10).map((g) => text(g, 60)).filter((g): g is string => !!g) : undefined,
    posterUrl: text(r.posterUrl, 500), backdropUrl: text(r.backdropUrl, 500), tmdbId: num(r.tmdbId),
    season: num(r.season), episode: num(r.episode), episodeTitle: text(r.episodeTitle, 300), airDate: text(r.airDate, 20),
  };
}

const xml = (s: string | number | undefined) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function movieNfo(m: Meta): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<movie>
  <title>${xml(m.title)}</title>
  <year>${xml(m.year)}</year>
  <plot>${xml(m.overview)}</plot>
  <rating>${xml(m.rating)}</rating>
${(m.genres ?? []).map((g) => `  <genre>${xml(g)}</genre>`).join('\n')}
${m.tmdbId ? `  <uniqueid type="tmdb" default="true">${m.tmdbId}</uniqueid>` : ''}
</movie>
`;
}

export function showNfo(m: Meta): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<tvshow>
  <title>${xml(m.title)}</title>
  <year>${xml(m.year)}</year>
  <plot>${xml(m.overview)}</plot>
  <rating>${xml(m.rating)}</rating>
${(m.genres ?? []).map((g) => `  <genre>${xml(g)}</genre>`).join('\n')}
${m.tmdbId ? `  <uniqueid type="tmdb" default="true">${m.tmdbId}</uniqueid>` : ''}
</tvshow>
`;
}

export function episodeNfo(m: Meta): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<episodedetails>
  <title>${xml(m.episodeTitle ?? `Episode ${m.episode}`)}</title>
  <showtitle>${xml(m.title)}</showtitle>
  <season>${xml(m.season)}</season>
  <episode>${xml(m.episode)}</episode>
  <aired>${xml(m.airDate)}</aired>
</episodedetails>
`;
}

function isImage(b: Uint8Array) {
  const jpg = b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  const png = b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
  const webp = b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50;
  return jpg || png || webp;
}

async function saveImage(url: string | undefined, dest: string) {
  if (!url) return;
  const u = new URL(url);
  if (u.protocol !== 'https:' || !IMAGE_HOSTS.some((h) => u.hostname === h || u.hostname.endsWith(`.${h}`))) return;
  const res = await fetch(u, { redirect: 'follow' });
  const host = new URL(res.url).hostname;
  if (!res.ok || !IMAGE_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))) return;
  const buf = new Uint8Array(await res.arrayBuffer());
  if (buf.byteLength > MAX_IMAGE_BYTES || !isImage(buf)) return;
  await writeFile(dest, buf);
}

/**
 * titleDir: the movie folder, or the show folder for an episode.
 * videoPath: the finished video, used to name an episode's .nfo.
 */
export async function writeArtworkAndInfo(m: Meta, titleDir: string, videoPath?: string) {
  const jobs: Promise<unknown>[] = [
    saveImage(m.posterUrl, join(titleDir, 'poster.jpg')),
    saveImage(m.backdropUrl, join(titleDir, 'fanart.jpg')),
    writeFile(join(titleDir, m.kind === 'tv' ? 'tvshow.nfo' : 'movie.nfo'), m.kind === 'tv' ? showNfo(m) : movieNfo(m)),
  ];
  if (m.kind === 'tv' && m.episode !== undefined && videoPath) {
    jobs.push(writeFile(videoPath.replace(/\.[^.\\/]+$/, '.nfo'), episodeNfo(m)));
  }
  // One failed image shouldn't stop the others or the download.
  await Promise.allSettled(jobs);
}
