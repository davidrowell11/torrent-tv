import { app, BrowserWindow, ipcMain, session, shell } from 'electron';
import { randomUUID } from 'node:crypto';
import { mkdirSync, rmSync } from 'node:fs';
import { open as openFile, rename, mkdir } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import WebTorrent, { type NodeTorrent } from 'webtorrent';
import { checkFile as checkSafeFile, checkTorrent, isTrustedTorrentUrl, isVideo } from '../src/core/safety.js';
import { verifyContent } from '../src/core/sniff.js';
import { availableScanner, scanFile } from './scan.js';
import { detectVpn } from './vpn.js';
import { sanitizeMeta, writeArtworkAndInfo, type Meta } from './metadata.js';

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(here, '..', '..');
const downloadRoot = join(app.getPath('downloads'), 'Torrent TV');
const quarantineRoot = join(downloadRoot, '.quarantine');
const EXTERNAL_OK = ['archive.org', 'themoviedb.org', 'github.com'];

type Phase = 'downloading' | 'checking' | 'ready' | 'awaiting-scan' | 'blocked';
interface Entry {
  label: string; torrent?: NodeTorrent; blockedReason?: string; error?: string; skipped: number; userPaused: boolean;
  phase: Phase; scanNote?: string; quarantineDir: string; meta?: Meta;
  /** Files that passed every check, now in the library folder. */
  finalFiles: string[];
  snapshot?: { name: string; size: number; files: string[] };
}
const entries = new Map<string, Entry>();
let client: WebTorrent | undefined;
let requireVpn = true;
let requireScan = true;
let killSwitchActive = false;

const getClient = () => (client ??= new WebTorrent({ maxConns: 55 }));

// ---------- Kill switch: pause everything and drop peer connections if the VPN goes away. ----------
function enforceVpn() {
  const vpn = detectVpn();
  const shouldBlock = requireVpn && !vpn.connected;
  if (shouldBlock && !killSwitchActive) {
    for (const e of entries.values()) {
      e.torrent?.pause();
      e.torrent?.wires.forEach((w) => w.destroy());
    }
  } else if (!shouldBlock && killSwitchActive) {
    for (const e of entries.values()) if (!e.userPaused) e.torrent?.resume();
  }
  killSwitchActive = shouldBlock;
}
setInterval(enforceVpn, 3000);

// ---------- Validated IPC ----------
const str = (v: unknown, max = 4096) => {
  if (typeof v !== 'string' || v.length > max) throw new Error('Invalid argument');
  return v;
};
const strList = (v: unknown) => {
  if (!Array.isArray(v) || v.length > 20) throw new Error('Invalid argument');
  return v.map((x) => str(x, 253));
};

async function fetchTorrent(url: string, hosts: string[]): Promise<string | Buffer> {
  if (!isTrustedTorrentUrl(url, hosts) && !isLocalFeed(url, hosts)) throw new Error('Refused: torrent link is not from a trusted source');
  if (url.startsWith('magnet:')) return url;
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`Could not fetch torrent (${res.status})`);
  // Indexers sometimes redirect a download link to a magnet; honour that only if it's a real magnet.
  if (res.url.startsWith('magnet:')) return res.url;
  if (!isTrustedTorrentUrl(res.url, hosts) && !isLocalFeed(res.url, hosts)) throw new Error('Refused: redirected to an untrusted host');
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > 5 * 1024 * 1024 || buf[0] !== 0x64) throw new Error('Refused: not a valid torrent file');
  return buf;
}

/** Local indexer managers (Prowlarr/Jackett on this machine) serve over plain http. */
function isLocalFeed(url: string, hosts: string[]) {
  try {
    const u = new URL(url);
    return u.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(u.hostname) && hosts.includes(u.hostname);
  } catch {
    return false;
  }
}

const cleanName = (s: string) => s.replace(/[^\p{L}\p{N} ._()'&,-]/gu, '').replace(/^[.\s]+|[.\s]+$/g, '').slice(0, 120) || 'download';

/**
 * Library layout media players understand:
 *   Films/Title (Year)/            TV/Show/Season 01/
 * Returns the title folder (where artwork goes) and the folder the video goes in.
 */
function libraryFolders(label: string, meta?: Meta) {
  let titleDir: string, videoDir: string;
  if (meta?.kind === 'tv' && meta.season !== undefined) {
    titleDir = resolve(downloadRoot, 'TV', cleanName(meta.title));
    videoDir = resolve(titleDir, `Season ${String(meta.season).padStart(2, '0')}`);
  } else if (meta) {
    titleDir = videoDir = resolve(downloadRoot, 'Films', cleanName(meta.year ? `${meta.title} (${meta.year})` : meta.title));
  } else {
    titleDir = videoDir = resolve(downloadRoot, cleanName(label));
  }
  if (!titleDir.startsWith(downloadRoot + sep) || !videoDir.startsWith(downloadRoot + sep)) throw new Error('Invalid folder');
  mkdirSync(videoDir, { recursive: true });
  return { titleDir, videoDir };
}

function info(id: string, e: Entry) {
  const t = e.torrent;
  const finished = e.phase !== 'downloading';
  const video = (e.snapshot?.files ?? t?.files.map((f) => f.path) ?? []).find((p) => isVideo(p));
  return {
    id, label: e.label, name: e.snapshot?.name ?? t?.name ?? e.label,
    progress: finished ? 1 : t?.progress ?? 0, downloadSpeed: finished ? 0 : t?.downloadSpeed ?? 0,
    numPeers: finished ? 0 : t?.numPeers ?? 0, sizeBytes: e.snapshot?.size ?? t?.length ?? 0,
    done: e.phase === 'ready', paused: !finished && (!!t?.paused || killSwitchActive),
    phase: e.phase, scanNote: e.scanNote,
    blockedReason: e.blockedReason, error: e.error, skippedFiles: e.skipped, videoName: video?.split(/[\\/]/).pop(),
  };
}

// ---------- Quarantine: verify content and virus-scan every file before it reaches the library. ----------
async function readHead(file: string) {
  const fh = await openFile(file, 'r');
  try {
    const buf = Buffer.alloc(64);
    const { bytesRead } = await fh.read(buf, 0, 64, 0);
    return new Uint8Array(buf.subarray(0, bytesRead));
  } finally {
    await fh.close();
  }
}

function block(e: Entry, reason: string) {
  e.phase = 'blocked';
  e.blockedReason = reason;
  rmSync(e.quarantineDir, { recursive: true, force: true });
}

async function releaseFromQuarantine(e: Entry) {
  const files = e.snapshot?.files ?? [];
  e.phase = 'checking';
  e.scanNote = 'Checking file contents';
  for (const rel of files) {
    const verdict = verifyContent(rel, await readHead(resolve(e.quarantineDir, rel)));
    if (!verdict.ok) return block(e, verdict.reason ?? 'File failed content check');
  }
  for (const rel of files) {
    e.scanNote = 'Scanning for viruses';
    const result = await scanFile(resolve(e.quarantineDir, rel));
    if (result.status === 'infected') return block(e, `${result.scanner} found a threat: ${result.detail || 'infected file'}`);
    if (result.status === 'error') return block(e, `${result.scanner} could not scan the file, so it was removed to be safe`);
    if (result.status === 'unavailable') {
      if (requireScan) {
        e.phase = 'awaiting-scan';
        e.scanNote = 'No virus scanner found. Install ClamAV (or turn on Microsoft Defender), then press Scan again.';
        return;
      }
      e.scanNote = 'Not virus-scanned (no scanner installed)';
    } else {
      e.scanNote = `Checked: real video, ${result.scanner} found no threats`;
    }
  }
  const { titleDir, videoDir: dest } = libraryFolders(e.label, e.meta);
  e.finalFiles = [];
  for (const rel of files) {
    const original = rel.split(/[\\/]/).pop()!;
    // Episodes are renamed "Show S01E02.ext" so players match them; films keep their name.
    const ext = original.slice(original.lastIndexOf('.'));
    const name = e.meta?.kind === 'tv' && isVideo(original) ? `${cleanName(e.label)}${ext}` : original;
    const target = resolve(dest, name);
    if (!target.startsWith(dest + sep)) return block(e, 'Unsafe file path');
    await mkdir(dirname(target), { recursive: true });
    await rename(resolve(e.quarantineDir, rel), target);
    e.finalFiles.push(target);
  }
  rmSync(e.quarantineDir, { recursive: true, force: true });
  if (e.meta) await writeArtworkAndInfo(e.meta, titleDir, e.finalFiles.find((f) => isVideo(f)));
  e.phase = 'ready';
}

ipcMain.handle('tt:add', async (_ev, rawUrl: unknown, rawLabel: unknown, rawHosts: unknown, rawMeta: unknown) => {
  const url = str(rawUrl), label = str(rawLabel, 200), hosts = strList(rawHosts);
  const id = randomUUID();
  const entry: Entry = {
    label, skipped: 0, userPaused: false, phase: 'downloading', quarantineDir: join(quarantineRoot, id), finalFiles: [], meta: sanitizeMeta(rawMeta),
  };
  entries.set(id, entry);
  if (requireVpn && !detectVpn().connected) {
    entry.error = 'No VPN detected. Connect your VPN, or turn off "Require VPN" in Settings.';
    return id;
  }
  try {
    const source = await fetchTorrent(url, hosts);
    // deselect: nothing is downloaded until the file list has passed safety checks.
    mkdirSync(entry.quarantineDir, { recursive: true });
    const t = getClient().add(source, { path: entry.quarantineDir, deselect: true });
    entry.torrent = t;
    const vet = () => {
      const verdict = checkTorrent(t.files.map((f) => ({ path: f.path, length: f.length })));
      if (!verdict.ok) {
        entry.blockedReason = verdict.reason;
        t.destroy({ destroyStore: true });
        return;
      }
      t.files.forEach((f, i) => {
        if (verdict.files[i].allowed) f.select();
        else { f.deselect(); entry.skipped++; }
      });
    };
    if (t.files.length) vet();
    else t.on('metadata', vet);
    t.on('error', (err) => (entry.error = String(err)));
    t.on('done', () => {
      if (entry.phase !== 'downloading') return;
      const kept = t.files.filter((f) => checkFile(f.path)).map((f) => f.path);
      entry.snapshot = { name: t.name, size: t.length, files: kept };
      // Stop sharing and release file handles before files are scanned and moved.
      t.destroy();
      releaseFromQuarantine(entry).catch((err) => block(entry, `Safety check failed: ${String(err)}`));
    });
  } catch (err) {
    entry.error = err instanceof Error ? err.message : String(err);
  }
  return id;
});

const checkFile = (path: string) => checkSafeFile({ path, length: 0 }).allowed;

ipcMain.handle('tt:rescan', (_e, id: unknown) => {
  const e = entries.get(str(id, 64));
  if (e?.phase === 'awaiting-scan') releaseFromQuarantine(e).catch((err) => block(e, `Safety check failed: ${String(err)}`));
});
ipcMain.handle('tt:setRequireScan', (_e, on: unknown) => {
  requireScan = on !== false;
});
ipcMain.handle('tt:scanner', () => availableScanner() ?? null);

ipcMain.handle('tt:list', () => [...entries].map(([id, e]) => info(id, e)));
ipcMain.handle('tt:pause', (_e, id: unknown) => {
  const e = entries.get(str(id, 64));
  if (e) { e.userPaused = true; e.torrent?.pause(); }
});
ipcMain.handle('tt:resume', (_e, id: unknown) => {
  const e = entries.get(str(id, 64));
  if (e && !killSwitchActive) { e.userPaused = false; e.torrent?.resume(); }
});
ipcMain.handle('tt:remove', (_e, id: unknown) => {
  const key = str(id, 64);
  const e = entries.get(key);
  e?.torrent?.destroy({ destroyStore: true });
  if (e && e.phase !== 'ready') rmSync(e.quarantineDir, { recursive: true, force: true });
  entries.delete(key);
});
ipcMain.handle('tt:open', (_e, id: unknown) => {
  const e = entries.get(str(id, 64));
  if (e?.phase !== 'ready') return;
  const video = e.finalFiles.find((f) => isVideo(f));
  if (video && video.startsWith(downloadRoot + sep) && !video.includes(`${sep}.quarantine${sep}`)) shell.showItemInFolder(video);
});
ipcMain.handle('tt:vpn', () => ({ supported: true, ...detectVpn(), killSwitchActive }));
ipcMain.handle('tt:setRequireVpn', (_e, on: unknown) => {
  requireVpn = on === true;
  enforceVpn();
});
/** Torznab searches from the page go through here so local indexers work without CORS. */
ipcMain.handle('tt:httpGet', async (_e, rawUrl: unknown) => {
  const u = new URL(str(rawUrl));
  const local = ['localhost', '127.0.0.1'].includes(u.hostname);
  if (u.protocol !== 'https:' && !(u.protocol === 'http:' && local)) throw new Error('Only https feeds are allowed');
  const res = await fetch(u, { redirect: 'error' });
  const text = (await res.text()).slice(0, 5_000_000);
  return { status: res.status, text };
});

// ---------- Window, locked down ----------
function createWindow() {
  const win = new BrowserWindow({
    width: 1360, height: 860, minWidth: 380, minHeight: 600,
    backgroundColor: '#0b0d12',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: join(here, '..', 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      spellcheck: false,
    },
  });
  win.setMenuBarVisibility(false);
  win.webContents.setWindowOpenHandler(({ url }) => {
    openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (ev, url) => {
    if (!url.startsWith('file://')) { ev.preventDefault(); openExternal(url); }
  });
  win.loadFile(join(appRoot, 'dist', 'index.html'));
}

function openExternal(url: string) {
  try {
    const u = new URL(url);
    if (u.protocol === 'https:' && EXTERNAL_OK.some((h) => u.hostname === h || u.hostname.endsWith(`.${h}`))) shell.openExternal(u.toString());
  } catch { /* ignore malformed */ }
}

app.on('web-contents-created', (_e, contents) => {
  contents.on('will-attach-webview', (ev) => ev.preventDefault());
});

app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((_wc, _perm, cb) => cb(false));
  mkdirSync(downloadRoot, { recursive: true });
  // Anything left in quarantine from a previous run was never verified: delete it.
  rmSync(quarantineRoot, { recursive: true, force: true });
  createWindow();
  app.on('activate', () => BrowserWindow.getAllWindows().length === 0 && createWindow());
});
app.on('window-all-closed', () => {
  client?.destroy();
  if (process.platform !== 'darwin') app.quit();
});
