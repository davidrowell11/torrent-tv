import { describe, expect, it } from 'vitest';
import { buildIaQuery, createInternetArchiveSource } from './internetArchive';
import { findTorrents } from './registry';
import { parseTorznab, validateTorznabUrl } from './torznab';
import type { TorrentSource } from './types';

const json = (body: unknown) => async () => new Response(JSON.stringify(body), { status: 200 });

describe('Internet Archive source', () => {
  it('builds a safe query', () => {
    const q = buildIaQuery({ kind: 'movie', title: 'Night of the Living Dead: "x" OR 1', year: 1968 });
    expect(q).not.toContain('"x"');
    expect(q).toContain('year:[1967 TO 1969]');
  });
  it('maps results to official torrent URLs and drops odd identifiers', async () => {
    const src = createInternetArchiveSource(json({ response: { docs: [
      { identifier: 'night_of_the_living_dead', title: 'Night of the Living Dead', item_size: 1e9 },
      { identifier: '../evil', title: 'Evil' },
    ] } }));
    const res = await src.search({ kind: 'movie', title: 'Night of the Living Dead' });
    expect(res).toHaveLength(1);
    expect(res[0].torrentUrl).toBe('https://archive.org/download/night_of_the_living_dead/night_of_the_living_dead_archive.torrent');
  });
});

describe('Torznab', () => {
  const xml = `<?xml version="1.0"?><rss xmlns:torznab="http://torznab.com/schemas/2015/feed"><channel>
    <item><title>Show S01E02 1080p</title><link>http://localhost:9696/dl/1</link>
      <torznab:attr name="seeders" value="120"/><torznab:attr name="size" value="1500000000"/></item>
    <item><title><![CDATA[Other &amp; Thing]]></title><enclosure url="http://localhost:9696/dl/2" type="application/x-bittorrent"/>
      <torznab:attr name="seeders" value="2"/></item>
  </channel></rss>`;
  it('parses items', () => {
    const items = parseTorznab(xml, 'feed');
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ name: 'Show S01E02 1080p', seeders: 120, sizeBytes: 1.5e9 });
    expect(items[1].name).toBe('Other & Thing');
  });
  it('only accepts https feeds, or http on this computer', () => {
    expect(validateTorznabUrl('https://indexer.example/api')).toBeUndefined();
    expect(validateTorznabUrl('http://localhost:9696/1/api')).toBeUndefined();
    expect(validateTorznabUrl('http://indexer.example/api')).toBeDefined();
    expect(validateTorznabUrl('https://user:pw@indexer.example/api')).toBeDefined();
  });
});

describe('findTorrents', () => {
  it('drops results pointing off a source’s own hosts and survives a failing source', async () => {
    const good: TorrentSource = {
      id: 'good', name: 'Good', description: '', homepage: '', allowedHosts: ['good.example'], supports: ['movie'],
      search: async () => [
        { sourceId: 'good', name: 'Film', torrentUrl: 'https://good.example/a.torrent' },
        { sourceId: 'good', name: 'Film', torrentUrl: 'https://evil.example/a.torrent' },
      ],
    };
    const broken: TorrentSource = { ...good, id: 'broken', search: async () => { throw new Error('down'); } };
    const res = await findTorrents({ kind: 'movie', title: 'Film' }, [good, broken]);
    expect(res.map((r) => r.torrentUrl)).toEqual(['https://good.example/a.torrent']);
  });
});
