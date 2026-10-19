export type MediaKind = 'movie' | 'tv';

/** Artwork and info for a title, sourced from TMDB. */
export interface TitleInfo {
  /** 0 when the title only exists on Internet Archive and has no TMDB entry. */
  tmdbId: number;
  /** Internet Archive item, when the title came from the free classics catalog. */
  iaId?: string;
  kind: MediaKind;
  title: string;
  year?: number;
  overview: string;
  posterUrl?: string;
  backdropUrl?: string;
  rating?: number;
  genres?: string[];
}

/** Artwork and info saved next to a finished download (poster, background, .nfo for media players). */
export interface DownloadMeta {
  title: string;
  kind: MediaKind;
  year?: number;
  overview?: string;
  rating?: number;
  genres?: string[];
  posterUrl?: string;
  backdropUrl?: string;
  tmdbId?: number;
  season?: number;
  episode?: number;
  episodeTitle?: string;
  airDate?: string;
}

export interface EpisodeRef {
  season: number;
  episode: number;
  title?: string;
  airDate?: string;
}

/** What we ask a source to find. */
export type SearchQuery =
  | { kind: 'movie'; title: string; year?: number }
  | { kind: 'tv'; title: string; year?: number; season: number; episode: number };

/** A torrent a source offers for a query. */
export interface TorrentCandidate {
  sourceId: string;
  /** HTTPS URL of a .torrent file, or a magnet URI. */
  torrentUrl: string;
  name: string;
  sizeBytes?: number;
  seeders?: number;
  license?: string;
  /** Page where the user can see the item on the source's own site. */
  detailsUrl?: string;
}

export type LibraryItemStatus = 'wanted' | 'searching' | 'downloading' | 'done' | 'not-found' | 'blocked';

export interface LibraryEpisode extends EpisodeRef {
  status: LibraryItemStatus;
  downloadId?: string;
  note?: string;
}

export interface LibraryItem {
  info: TitleInfo;
  addedAt: string;
  /** Movies: overall status. Shows: summary only; episodes carry their own status. */
  status: LibraryItemStatus;
  downloadId?: string;
  note?: string;
  /** TV only: auto-fetch new episodes as they air. */
  follow?: boolean;
  /** TV only: episodes before this point are ignored (defaults to "from when you followed"). */
  followFrom?: { season: number; episode: number };
  episodes?: LibraryEpisode[];
  lastCheckedAt?: string;
}
