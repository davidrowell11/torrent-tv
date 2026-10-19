// Minimal typing for the parts of WebTorrent this app uses.
declare module 'webtorrent/dist/webtorrent.min.js' {
  export interface WTFile {
    name: string;
    path: string;
    length: number;
    select(): void;
    deselect(): void;
    blob(): Promise<Blob>;
  }
  export interface WTTorrent {
    infoHash: string;
    name: string;
    length: number;
    progress: number;
    downloadSpeed: number;
    numPeers: number;
    done: boolean;
    paused: boolean;
    files: WTFile[];
    ready: boolean;
    pause(): void;
    resume(): void;
    destroy(opts?: unknown, cb?: () => void): void;
    on(event: 'ready' | 'metadata' | 'done', cb: () => void): void;
    on(event: 'error', cb: (err: Error | string) => void): void;
  }
  export default class WebTorrent {
    constructor(opts?: Record<string, unknown>);
    add(torrentId: string | Uint8Array, opts?: Record<string, unknown>, cb?: (t: WTTorrent) => void): WTTorrent;
    on(event: 'error', cb: (err: Error | string) => void): void;
    torrents: WTTorrent[];
  }
}
