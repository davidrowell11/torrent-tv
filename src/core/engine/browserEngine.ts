import { checkTorrent, isVideo } from '../safety';
import { verifyContent } from '../sniff';
import { fetchTorrentFile } from './fetchTorrent';
import { buildMedia } from './media';
import type { DownloadInfo, TorrentEngine } from './types';
import type WebTorrentType from 'webtorrent/dist/webtorrent.min.js';
import type { WTFile, WTTorrent } from 'webtorrent/dist/webtorrent.min.js';

interface Entry {
  label: string;
  torrent?: WTTorrent;
  blockedReason?: string;
  error?: string;
  skipped: number;
  phase: DownloadInfo['phase'];
  scanNote?: string;
  name?: string;
  sizeBytes?: number;
  /** Finished files: names in this download's private storage folder. */
  files?: string[];
  /** Fallback when the browser has no private file storage: files live in memory until reload. */
  blobs?: Map<string, Blob>;
}

interface Saved {
  id: string;
  label: string;
  name: string;
  sizeBytes: number;
  scanNote?: string;
  files: string[];
}

const INDEX_KEY = 'torrent-tv/downloads/v1';
const PLAYABLE = /\.(mp4|webm|m4v|mkv)$/i;
const SUBS = /\.(srt|vtt)$/i;

const loadIndex = (): Saved[] => {
  try {
    return JSON.parse(localStorage.getItem(INDEX_KEY) ?? '[]');
  } catch {
    return [];
  }
};

/** The browser's private file system (OPFS): files survive reloads and are invisible to other sites. */
async function downloadsDir(): Promise<FileSystemDirectoryHandle | undefined> {
  try {
    const root = await navigator.storage.getDirectory();
    return await root.getDirectoryHandle('downloads', { create: true });
  } catch {
    return undefined;
  }
}

async function writeFile(dir: FileSystemDirectoryHandle, name: string, file: WTFile) {
  const handle = await dir.getFileHandle(name, { create: true });
  const writable = await handle.createWritable();
  await writable.write(await file.blob());
  await writable.close();
}

/**
 * In-browser engine, used on phones, Chromebooks and anywhere the desktop app
 * isn't installed. Browsers can only reach WebRTC peers and HTTPS web seeds,
 * which is exactly how Internet Archive torrents are served. Finished files are
 * kept in the browser's private storage so they can be watched offline.
 */
export function createBrowserEngine(): TorrentEngine {
  let client: WebTorrentType | undefined;
  const entries = new Map<string, Entry>();
  for (const s of loadIndex()) {
    entries.set(s.id, { label: s.label, name: s.name, sizeBytes: s.sizeBytes, scanNote: s.scanNote, files: s.files, phase: 'ready', skipped: 0 });
  }
  const saveIndex = () => {
    const saved: Saved[] = [...entries]
      .filter(([, e]) => e.phase === 'ready' && e.files && !e.blobs)
      .map(([id, e]) => ({ id, label: e.label, name: e.name ?? e.label, sizeBytes: e.sizeBytes ?? 0, scanNote: e.scanNote, files: e.files! }));
    try {
      localStorage.setItem(INDEX_KEY, JSON.stringify(saved));
    } catch {
      // storage full or blocked: downloads still play this session
    }
  };
  // Ask the browser not to evict downloads when space runs low.
  navigator.storage?.persist?.().catch(() => {});

  async function getClient() {
    if (!client) {
      const { default: WebTorrent } = await import('webtorrent/dist/webtorrent.min.js');
      client = new WebTorrent();
      client.on('error', (e) => console.error('[torrent]', e));
    }
    return client;
  }

  async function finish(id: string, e: Entry, t: WTTorrent) {
    e.phase = 'checking';
    e.scanNote = 'Checking file contents';
    const keep = t.files.filter((f) => PLAYABLE.test(f.name) || SUBS.test(f.name)).filter((f) => isSelected(f));
    for (const f of keep) {
      const head = new Uint8Array(await (await f.blob()).slice(0, 64).arrayBuffer());
      const v = verifyContent(f.name, head);
      if (!v.ok) {
        e.phase = 'blocked';
        e.blockedReason = v.reason;
        t.destroy({ destroyStore: true });
        return;
      }
    }
    e.name = t.name;
    e.sizeBytes = keep.reduce((n, f) => n + f.length, 0);
    e.files = keep.map((f) => f.name);
    e.scanNote = 'Saving to this device';
    const root = await downloadsDir();
    try {
      if (!root) throw new Error('no private storage');
      const dir = await root.getDirectoryHandle(id, { create: true });
      for (const f of keep) await writeFile(dir, f.name, f);
    } catch {
      e.blobs = new Map();
      for (const f of keep) e.blobs.set(f.name, await f.blob());
    }
    t.destroy({ destroyStore: true });
    e.torrent = undefined;
    e.phase = 'ready';
    e.scanNote = e.blobs
      ? 'Verified real video. This browser can only keep it until the page is closed.'
      : 'Verified real video. Saved on this device. (Virus scanning needs the desktop app.)';
    saveIndex();
  }

  // WebTorrent marks deselected files with no pieces wanted; track our own selection instead.
  const selected = new WeakSet<WTFile>();
  const isSelected = (f: WTFile) => selected.has(f);

  async function filesOf(id: string): Promise<Map<string, Blob> | undefined> {
    const e = entries.get(id);
    if (!e || e.phase !== 'ready' || !e.files) return undefined;
    if (e.blobs) return e.blobs;
    const root = await downloadsDir();
    if (!root) return undefined;
    try {
      const dir = await root.getDirectoryHandle(id);
      const out = new Map<string, Blob>();
      for (const name of e.files) out.set(name, await (await dir.getFileHandle(name)).getFile());
      return out;
    } catch {
      e.error = 'This file is no longer on this device';
      return undefined;
    }
  }

  const info = (id: string, e: Entry): DownloadInfo => {
    const t = e.torrent;
    const finished = e.phase !== 'downloading';
    return {
      id,
      label: e.label,
      name: e.name ?? t?.name ?? e.label,
      progress: finished ? 1 : t?.progress ?? 0,
      downloadSpeed: finished ? 0 : t?.downloadSpeed ?? 0,
      numPeers: finished ? 0 : t?.numPeers ?? 0,
      sizeBytes: e.sizeBytes ?? t?.length ?? 0,
      done: e.phase === 'ready',
      phase: e.phase,
      scanNote: e.scanNote,
      paused: !finished && !!t?.paused,
      blockedReason: e.blockedReason,
      error: e.error,
      skippedFiles: e.skipped,
      videoName: (e.files ?? t?.files.map((f) => f.name) ?? []).find((n) => isVideo(n)),
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
          // Only the largest playable video plus subtitles. Archive torrents bundle several encodes.
          const video = t.files.filter((f) => PLAYABLE.test(f.name)).sort((a, b) => b.length - a.length)[0];
          t.files.forEach((f, i) => {
            const ok = verdict.files[i].allowed && (f === video || SUBS.test(f.name));
            if (ok) {
              f.select();
              selected.add(f);
            } else {
              f.deselect();
              if (!verdict.files[i].allowed) entry.skipped++;
            }
          });
        };
        if (t.files.length) vet();
        else t.on('metadata', vet);
        t.on('error', (err) => (entry.error = String(err)));
        t.on('done', () => {
          finish(id, entry, t).catch((err) => {
            entry.phase = 'blocked';
            entry.blockedReason = `Safety check failed: ${err instanceof Error ? err.message : err}`;
          });
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
      entries.get(id)?.torrent?.destroy({ destroyStore: true });
      entries.delete(id);
      saveIndex();
    },
    async deleteFiles(id) {
      entries.get(id)?.torrent?.destroy({ destroyStore: true });
      const root = await downloadsDir();
      await root?.removeEntry(id, { recursive: true }).catch(() => {});
      entries.delete(id);
      saveIndex();
    },
    async media(id) {
      const files = await filesOf(id);
      if (!files) return undefined;
      const videoName = [...files.keys()].find((n) => PLAYABLE.test(n));
      if (!videoName) return undefined;
      const subs = await Promise.all(
        [...files].filter(([n]) => SUBS.test(n)).map(async ([name, blob]) => ({ name, text: await blob.text() })),
      );
      return buildMedia(files.get(videoName)!, subs);
    },
    async storageUsed() {
      return [...entries.values()].filter((e) => e.phase === 'ready').reduce((n, e) => n + (e.sizeBytes ?? 0), 0);
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
