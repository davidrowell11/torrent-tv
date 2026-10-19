import { checkTorrent } from '../safety';
import { verifyContent } from '../sniff';
import { fetchTorrentFile } from './fetchTorrent';
import type { DownloadInfo, TorrentEngine } from './types';
import type WebTorrentType from 'webtorrent/dist/webtorrent.min.js';
import type { WTTorrent } from 'webtorrent/dist/webtorrent.min.js';

interface Entry {
  label: string;
  torrent?: WTTorrent;
  blockedReason?: string;
  error?: string;
  skipped: number;
  blobUrl?: string;
  phase: DownloadInfo['phase'];
  scanNote?: string;
}

/**
 * In-browser engine. Browsers can only reach WebRTC peers and HTTP web seeds,
 * which is exactly how Internet Archive torrents are served. Files are kept
 * in the browser until the user plays or saves them.
 */
export function createBrowserEngine(): TorrentEngine {
  let client: WebTorrentType | undefined;
  const entries = new Map<string, Entry>();

  async function getClient() {
    if (!client) {
      const { default: WebTorrent } = await import('webtorrent/dist/webtorrent.min.js');
      client = new WebTorrent();
      client.on('error', (e) => console.error('[torrent]', e));
    }
    return client;
  }

  const info = (id: string, e: Entry): DownloadInfo => {
    const t = e.torrent;
    const video = t?.files.filter((f) => /\.(mp4|m4v|webm|mkv|mov|ogv|avi|mpe?g)$/i.test(f.name)).sort((a, b) => b.length - a.length)[0];
    return {
      id,
      label: e.label,
      name: t?.name ?? e.label,
      progress: t?.progress ?? 0,
      downloadSpeed: t?.downloadSpeed ?? 0,
      numPeers: t?.numPeers ?? 0,
      sizeBytes: t?.length ?? 0,
      done: e.phase === 'ready',
      phase: e.phase,
      scanNote: e.scanNote,
      paused: !!t?.paused,
      blockedReason: e.blockedReason,
      error: e.error,
      skippedFiles: e.skipped,
      videoName: video?.name,
    };
  };

  return {
    kind: 'browser',
    async add(url, label, hosts) {
      const id = crypto.randomUUID();
      const entry: Entry = { label, skipped: 0, phase: 'downloading' };
      entries.set(id, entry);
      try {
        const source = await fetchTorrentFile(url, hosts);
        const c = await getClient();
        const t = c.add(source, { deselect: true });
        entry.torrent = t;
        const vet = () => {
          const verdict = checkTorrent(t.files.map((f) => ({ path: f.path, length: f.length })));
          if (!verdict.ok) {
            entry.blockedReason = verdict.reason;
            entry.phase = 'blocked';
            t.destroy();
            return;
          }
          // Only largest video plus subtitles. Archive torrents bundle several encodes.
          const video = t.files.filter((f) => /\.(mp4|webm|m4v|mkv)$/i.test(f.name)).sort((a, b) => b.length - a.length)[0];
          t.files.forEach((f, i) => {
            const ok = verdict.files[i].allowed && (f === video || /\.(srt|vtt)$/i.test(f.name));
            if (ok) f.select();
            else {
              f.deselect();
              if (!verdict.files[i].allowed) entry.skipped++;
            }
          });
        };
        if (t.files.length) vet();
        else t.on('metadata', vet);
        t.on('error', (err) => (entry.error = String(err)));
        t.on('done', async () => {
          entry.phase = 'checking';
          entry.scanNote = 'Checking file contents';
          for (const f of t.files.filter((x) => /\.(mp4|webm|m4v|mkv|srt|vtt)$/i.test(x.name))) {
            const head = new Uint8Array(await (await f.blob()).slice(0, 64).arrayBuffer());
            const v = verifyContent(f.name, head);
            if (!v.ok) {
              entry.phase = 'blocked';
              entry.blockedReason = v.reason;
              t.destroy({ destroyStore: true });
              return;
            }
          }
          entry.phase = 'ready';
          entry.scanNote = 'Verified real video. Virus scanning needs the desktop app; your browser also checks files you save.';
        });
      } catch (err) {
        entry.error = err instanceof Error ? err.message : String(err);
      }
      return id;
    },
    async list() {
      return [...entries].map(([id, e]) => info(id, e));
    },
    async pause(id) {
      entries.get(id)?.torrent?.pause();
    },
    async resume(id) {
      entries.get(id)?.torrent?.resume();
    },
    async remove(id) {
      const e = entries.get(id);
      e?.torrent?.destroy({ destroyStore: true });
      if (e?.blobUrl) URL.revokeObjectURL(e.blobUrl);
      entries.delete(id);
    },
    async open(id) {
      const e = entries.get(id);
      const t = e?.torrent;
      if (!e || !t || e.phase !== 'ready') return;
      const video = t.files.filter((f) => /\.(mp4|webm|m4v|mkv)$/i.test(f.name)).sort((a, b) => b.length - a.length)[0];
      if (!video) return;
      e.blobUrl ??= URL.createObjectURL(await video.blob());
      return e.blobUrl;
    },
    async vpn() {
      return { supported: false, connected: false, killSwitchActive: false };
    },
    async setRequireVpn() {},
    async setRequireScan() {},
    async rescan() {},
    async scanner() {
      return null;
    },
  };
}
