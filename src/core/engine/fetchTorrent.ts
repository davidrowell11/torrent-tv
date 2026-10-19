import { isTrustedTorrentUrl } from '../safety';

const MAX_TORRENT_FILE_BYTES = 5 * 1024 * 1024;

/** Download a .torrent file only from a trusted host, with a size cap. Magnets pass through. */
export async function fetchTorrentFile(url: string, allowedHosts: string[], fetcher: typeof fetch = fetch): Promise<string | Uint8Array> {
  if (!isTrustedTorrentUrl(url, allowedHosts)) throw new Error('Refused: torrent link is not from a trusted source');
  if (url.startsWith('magnet:')) return url;
  const res = await fetcher(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`Could not fetch torrent (${res.status})`);
  if (res.url && !isTrustedTorrentUrl(res.url, allowedHosts)) throw new Error('Refused: torrent link redirected to an untrusted host');
  const buf = new Uint8Array(await res.arrayBuffer());
  if (buf.byteLength > MAX_TORRENT_FILE_BYTES) throw new Error('Refused: torrent file is unusually large');
  if (buf[0] !== 0x64 /* 'd' bencoded dict */) throw new Error('Refused: not a valid torrent file');
  return buf;
}
