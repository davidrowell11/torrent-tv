declare module 'webtorrent' {
  export interface NodeFile { name: string; path: string; length: number; select(): void; deselect(): void }
  export interface NodeTorrent {
    infoHash: string; name: string; length: number; progress: number; downloadSpeed: number;
    numPeers: number; done: boolean; paused: boolean; path: string; files: NodeFile[];
    wires: { destroy(): void }[];
    pause(): void; resume(): void; destroy(opts?: unknown): void;
    on(event: 'metadata' | 'done', cb: () => void): void;
    on(event: 'error', cb: (err: Error | string) => void): void;
  }
  export default class WebTorrent {
    constructor(opts?: Record<string, unknown>);
    add(id: string | Uint8Array, opts?: Record<string, unknown>): NodeTorrent;
    on(event: 'error', cb: (err: Error | string) => void): void;
    destroy(): void;
  }
}
