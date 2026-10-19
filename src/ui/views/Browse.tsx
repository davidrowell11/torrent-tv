import { useEffect, useRef, useState } from 'react';
import { defaultFilters, LANGUAGES, YEARS, type DiscoverFilters, type SortBy } from '../../core/metadata/discover';
import { keyOf } from '../../core/library';
import type { LibraryItemStatus, MediaKind, TitleInfo } from '../../core/types';
import { Icon } from '../components/Icon';
import { Poster } from '../components/Poster';
import { useStore } from '../store';

const FILTERS_KEY = 'torrent-tv/browse-filters/v1';
const loadFilters = (): DiscoverFilters => {
  try {
    return { ...defaultFilters, ...JSON.parse(localStorage.getItem(FILTERS_KEY) ?? '{}') };
  } catch {
    return defaultFilters;
  }
};

const SORTS: [SortBy, string][] = [['popular', 'Popular'], ['newest', 'Newest'], ['top', 'Top rated']];
const RATINGS: [number, string][] = [[0, 'Any rating'], [6, '6+ ★'], [7, '7+ ★'], [8, '8+ ★']];

/** Browse all films or TV with filters: type, genre, year, rating, language and sort order. */
export function Browse({ open, inLib }: { open(info: TitleInfo): void; inLib(i: TitleInfo): LibraryItemStatus | undefined }) {
  const { tmdb } = useStore();
  const [f, setF] = useState<DiscoverFilters>(loadFilters);
  const [genres, setGenres] = useState<Record<MediaKind, { id: number; name: string }[]>>({ movie: [], tv: [] });
  const [items, setItems] = useState<TitleInfo[] | null>(null);
  const [page, setPage] = useState(1);
  const [more, setMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const top = useRef<HTMLDivElement>(null);

  const update = (patch: Partial<DiscoverFilters>) => {
    // Genre ids differ between films and TV, so switching type clears the genre.
    const next = { ...f, ...patch, ...(patch.kind && patch.kind !== f.kind ? { genreId: undefined } : {}) };
    setF(next);
    try {
      localStorage.setItem(FILTERS_KEY, JSON.stringify(next));
    } catch { /* per-device convenience only */ }
  };

  useEffect(() => {
    if (!tmdb) return;
    Promise.all([tmdb.genres('movie'), tmdb.genres('tv')]).then(([movie, tv]) => setGenres({ movie, tv })).catch(() => {});
  }, [tmdb]);

  // New filters: start again from page 1.
  useEffect(() => {
    if (!tmdb) return;
    const ac = new AbortController();
    setLoading(true);
    setItems(null);
    setPage(1);
    tmdb.discover(f, 1, ac.signal)
      .then((r) => { setItems(r.results); setMore(r.more); })
      .catch(() => !ac.signal.aborted && setItems([]))
      .finally(() => !ac.signal.aborted && setLoading(false));
    return () => ac.abort();
  }, [tmdb, f]);

  const loadMore = async () => {
    if (!tmdb || loading) return;
    setLoading(true);
    try {
      const r = await tmdb.discover(f, page + 1);
      setItems((cur) => {
        const seen = new Set((cur ?? []).map(keyOf));
        return [...(cur ?? []), ...r.results.filter((x) => !seen.has(keyOf(x)))];
      });
      setMore(r.more);
      setPage(page + 1);
    } finally {
      setLoading(false);
    }
  };

  const active = (f.genreId ? 1 : 0) + (f.year !== 'any' ? 1 : 0) + (f.minRating ? 1 : 0) + (f.language ? 1 : 0);

  if (!tmdb) return <p className="muted browse-empty">Add a TMDB key in Settings to browse every film and show.</p>;

  return (
    <section className="browse" ref={top}>
      <div className="filters">
        <div className="filter-row">
          <div className="segmented">
            <button className={f.kind === 'movie' ? 'active' : ''} onClick={() => update({ kind: 'movie' })}><Icon name="film" size={16} />Films</button>
            <button className={f.kind === 'tv' ? 'active' : ''} onClick={() => update({ kind: 'tv' })}><Icon name="tv" size={16} />TV shows</button>
          </div>
          <div className="segmented">
            {SORTS.map(([v, label]) => <button key={v} className={f.sort === v ? 'active' : ''} onClick={() => update({ sort: v })}>{label}</button>)}
          </div>
        </div>
        <div className="chips" role="group" aria-label="Genre">
          <button className={`chip-btn ${!f.genreId ? 'on' : ''}`} onClick={() => update({ genreId: undefined })}>All genres</button>
          {genres[f.kind].map((g) => (
            <button key={g.id} className={`chip-btn ${f.genreId === g.id ? 'on' : ''}`} onClick={() => update({ genreId: f.genreId === g.id ? undefined : g.id })}>{g.name}</button>
          ))}
        </div>
        <div className="filter-row selects">
          <select aria-label="Year" value={f.year} onChange={(e) => update({ year: e.target.value as DiscoverFilters['year'] })}>
            {YEARS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <select aria-label="Rating" value={f.minRating} onChange={(e) => update({ minRating: Number(e.target.value) })}>
            {RATINGS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <select aria-label="Language" value={f.language} onChange={(e) => update({ language: e.target.value })}>
            {LANGUAGES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          {active > 0 && (
            <button className="btn small subtle" onClick={() => update({ genreId: undefined, year: 'any', minRating: 0, language: '' })}>
              <Icon name="close" size={14} />Clear {active} filter{active > 1 ? 's' : ''}
            </button>
          )}
        </div>
      </div>

      {items && items.length === 0 && !loading && <p className="muted browse-empty">Nothing matches these filters. Try widening them.</p>}
      <div className="grid">
        {items?.map((r) => <Poster key={keyOf(r)} info={r} status={inLib(r)} onOpen={() => open(r)} />)}
        {!items && Array.from({ length: 12 }, (_, i) => <div key={i} className="poster skeleton"><div className="poster-art" /><div className="sk-line" /></div>)}
      </div>
      {more && items && (
        <div className="load-more">
          <button className="btn ghost" onClick={loadMore} disabled={loading}>{loading ? 'Loading…' : 'Show more'}</button>
        </div>
      )}
    </section>
  );
}
