import { isTrustedTorrentUrl } from '../safety';
import type { SearchQuery, TorrentCandidate } from '../types';
import { createInternetArchiveSource } from './internetArchive';
import { createTorznabSource, type TorznabConfig } from './torznab';
import type { Fetcher, TorrentSource } from './types';

export type { TorrentSource } from './types';

export const builtInSources: TorrentSource[] = [createInternetArchiveSource()];

/** Built-in sources first, then any Torznab feeds the user added. */
export function allSources(custom: TorznabConfig[], fetcher?: Fetcher): TorrentSource[] {
  return [...builtInSources, ...custom.map((c) => createTorznabSource(c, fetcher))];
}

/**
 * Ask every enabled source, drop any result that points off a source's own
 * hosts, and rank the rest (seeders, then a title match).
 */
export async function findTorrents(
  query: SearchQuery,
  sources: TorrentSource[],
  enabled: (id: string) => boolean = () => true,
  signal?: AbortSignal,
): Promise<TorrentCandidate[]> {
  const active = sources.filter((s) => enabled(s.id) && s.supports.includes(query.kind));
  const settled = await Promise.allSettled(active.map((s) => s.search(query, signal).then((r) => ({ s, r }))));
  const results: TorrentCandidate[] = [];
  for (const outcome of settled) {
    if (outcome.status !== 'fulfilled') continue;
    const { s, r } = outcome.value;
    results.push(...r.filter((c) => c.sourceId === s.id && isTrustedTorrentUrl(c.torrentUrl, s.allowedHosts)));
  }
  const want = query.title.toLowerCase();
  const score = (c: TorrentCandidate) => (c.name.toLowerCase().includes(want) ? 1000 : 0) + (c.seeders ?? 0);
  return results.sort((a, b) => score(b) - score(a));
}
