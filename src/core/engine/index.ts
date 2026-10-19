import { createBrowserEngine } from './browserEngine';
import { createDesktopEngine } from './desktopEngine';
export { feedFetcher } from './desktopEngine';
import type { TorrentEngine } from './types';

export type { DownloadInfo, PlayableMedia, TorrentEngine, VpnStatus } from './types';

let engine: TorrentEngine | undefined;
export function getEngine(): TorrentEngine {
  return (engine ??= createDesktopEngine() ?? createBrowserEngine());
}
