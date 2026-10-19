import type { DownloadMeta } from '../types';

export interface DownloadInfo {
  id: string;
  /** What the user asked for, e.g. "Night of the Living Dead" or "The Twilight Zone S01E03". */
  label: string;
  name: string;
  progress: number;
  downloadSpeed: number;
  numPeers: number;
  sizeBytes: number;
  done: boolean;
  paused: boolean;
  /** Set when safety checks refused the torrent; nothing was saved. */
  blockedReason?: string;
  error?: string;
  /** Unsafe or non-media files that were skipped. */
  skippedFiles: number;
  videoName?: string;
  /** downloading → checking (content + virus scan in quarantine) → ready, or blocked. */
  phase: 'downloading' | 'checking' | 'ready' | 'awaiting-scan' | 'blocked';
  /** What the safety checks found, in plain words. */
  scanNote?: string;
}

export interface VpnStatus {
  supported: boolean;
  connected: boolean;
  interfaceName?: string;
  /** True when torrents are paused because the VPN dropped. */
  killSwitchActive: boolean;
}

export interface TorrentEngine {
  kind: 'browser' | 'desktop';
  add(torrentUrl: string, label: string, allowedHosts: string[], meta?: DownloadMeta): Promise<string>;
  list(): Promise<DownloadInfo[]>;
  pause(id: string): Promise<void>;
  resume(id: string): Promise<void>;
  remove(id: string): Promise<void>;
  /** Desktop: reveal the file. Browser: return a blob URL to play or save. */
  open(id: string): Promise<string | void>;
  vpn(): Promise<VpnStatus>;
  setRequireVpn(on: boolean): Promise<void>;
  setRequireScan(on: boolean): Promise<void>;
  /** Retry the virus scan for a download waiting on one. */
  rescan(id: string): Promise<void>;
  /** Name of the antivirus the engine will use, or null when none is available. */
  scanner(): Promise<string | null>;
  /** Desktop only: fetch a feed without browser CORS limits. */
  httpGet?(url: string): Promise<{ status: number; text: string }>;
}
