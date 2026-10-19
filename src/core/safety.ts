/**
 * Safety checks applied to every torrent before any byte is written to disk.
 *
 * The rule is an allowlist: only video and subtitle files are ever downloaded.
 * Everything else in a torrent (executables, scripts, archives, installers,
 * disguised "movie.mp4.exe" files) is skipped, and a torrent whose main content
 * is not video is rejected outright.
 */

export const VIDEO_EXTENSIONS = ['mp4', 'm4v', 'mkv', 'webm', 'mov', 'avi', 'ogv', 'mpg', 'mpeg'] as const;
export const SUBTITLE_EXTENSIONS = ['srt', 'vtt', 'ass', 'ssa', 'sub'] as const;
const ALLOWED = new Set<string>([...VIDEO_EXTENSIONS, ...SUBTITLE_EXTENSIONS]);

/** Extensions that should never appear anywhere in a media file name. */
const DANGEROUS = new Set([
  'exe', 'msi', 'bat', 'cmd', 'com', 'scr', 'pif', 'lnk', 'dll', 'sys', 'cpl', 'hta',
  'js', 'jse', 'vbs', 'vbe', 'wsf', 'ps1', 'psm1', 'jar', 'apk', 'app', 'dmg', 'pkg',
  'deb', 'rpm', 'sh', 'run', 'bin', 'iso', 'img', 'zip', 'rar', '7z', 'tar', 'gz',
  'url', 'html', 'htm', 'svg', 'reg', 'docm', 'xlsm', 'pptm',
]);

/** Smallest a real episode/film plausibly is. Tiny "videos" are a classic lure. */
export const MIN_VIDEO_BYTES = 5 * 1024 * 1024;

export interface TorrentFileLike {
  path: string;
  length: number;
}

export interface FileVerdict {
  path: string;
  allowed: boolean;
  reason?: string;
}

export interface TorrentVerdict {
  ok: boolean;
  reason?: string;
  files: FileVerdict[];
}

export function extensionsOf(path: string): string[] {
  const name = path.split(/[\\/]/).pop() ?? '';
  return name.toLowerCase().split('.').slice(1);
}

export function checkFile(file: TorrentFileLike): FileVerdict {
  const name = file.path.split(/[\\/]/).pop() ?? '';
  const exts = extensionsOf(file.path);
  const last = exts[exts.length - 1];

  if (file.path.includes('..') || file.path.startsWith('/') || /^[a-zA-Z]:/.test(file.path)) {
    return { path: file.path, allowed: false, reason: 'Unsafe file path' };
  }
  // Right-to-left override and other bidi controls are used to disguise extensions.
  if (/[\u202A-\u202E\u2066-\u2069]/.test(name)) {
    return { path: file.path, allowed: false, reason: 'Disguised file name' };
  }
  if (!last || !ALLOWED.has(last)) {
    return { path: file.path, allowed: false, reason: last ? `.${last} files are never downloaded` : 'No file type' };
  }
  if (exts.slice(0, -1).some((e) => DANGEROUS.has(e))) {
    return { path: file.path, allowed: false, reason: 'Double extension (possible disguised program)' };
  }
  return { path: file.path, allowed: true };
}

export function isVideo(path: string): boolean {
  const exts = extensionsOf(path);
  return (VIDEO_EXTENSIONS as readonly string[]).includes(exts[exts.length - 1] ?? '');
}

/**
 * Decide whether a torrent is safe to download and which files to keep.
 * Rejects torrents whose largest file is not an allowed video, since that is
 * the signature of malware wrapped in a media-looking name.
 */
export function checkTorrent(files: TorrentFileLike[]): TorrentVerdict {
  const verdicts = files.map(checkFile);
  if (files.length === 0) return { ok: false, reason: 'Torrent is empty', files: verdicts };

  const largest = files.reduce((a, b) => (b.length > a.length ? b : a));
  const largestVerdict = verdicts[files.indexOf(largest)];
  if (!largestVerdict.allowed || !isVideo(largest.path)) {
    return { ok: false, reason: `Main file "${largest.path}" is not a video`, files: verdicts };
  }
  if (largest.length < MIN_VIDEO_BYTES) {
    return { ok: false, reason: 'Video is suspiciously small', files: verdicts };
  }
  if (files.some((f) => DANGEROUS.has(extensionsOf(f.path).pop() ?? ''))) {
    // Still safe to fetch the video alone, but tell the user the torrent had junk in it.
    return { ok: true, reason: 'Skipped unsafe extra files in this torrent', files: verdicts };
  }
  return { ok: true, files: verdicts };
}

/** Torrent links must be magnets or HTTPS URLs on a host the source vouches for. */
export function isTrustedTorrentUrl(url: string, allowedHosts: string[]): boolean {
  if (url.startsWith('magnet:?')) return /xt=urn:bt[im]h:/i.test(url);
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'https:') return false;
  const host = parsed.hostname.toLowerCase();
  return allowedHosts.some((h) => host === h || host.endsWith(`.${h}`));
}
