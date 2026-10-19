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

export interface SubtitleTrack {
  label: string;
  lang: string;
  /** WebVTT URL ready for a <track> element. */
  url: string;
}

export interface PlayableMedia {
  videoUrl: string;
  subtitles: SubtitleTrack[];
  /** Release this media's object URLs when the player closes. */
  release(): void;
}

export interface TorrentEngine {
  kind: 'browser' | 'desktop';
  add(torrentUrl: string, label: string, allowedHosts: string[], meta?: DownloadMeta): Promise<string>;
  list(): Promise<DownloadInfo[]>;
  pause(id: string): Promise<void>;
  resume(id: string): Promise<void>;
  /** Stop a download and forget it. Files already in the library are kept. */
  remove(id: string): Promise<void>;
  /** Delete a finished download's files from this device, then forget it. */
  deleteFiles(id: string): Promise<void>;
  /** Video and subtitles for the built-in player, once a download is ready. */
  media(id: string): Promise<PlayableMedia | undefined>;
  /** Desktop: show the file in its folder. */
  reveal?(id: string): Promise<void>;
  /** Bytes used by finished downloads on this device. */
  storageUsed(): Promise<number>;
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
