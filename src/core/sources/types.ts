import type { SearchQuery, TorrentCandidate } from '../types';

/**
 * A place the app may fetch torrents from. Each source declares the hosts its
 * torrent files come from; links to any other host are refused.
 *
 * Built-in sources only cover content that is legal to share (public domain or
 * openly licensed). Adding a source is a code change reviewed like any other,
 * not a URL pasted into settings, so a bad actor can't redirect the app.
 */
export interface TorrentSource {
  id: string;
  name: string;
  description: string;
  homepage: string;
  allowedHosts: string[];
  supports: ('movie' | 'tv')[];
  search(query: SearchQuery, signal?: AbortSignal): Promise<TorrentCandidate[]>;
}

export type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;
