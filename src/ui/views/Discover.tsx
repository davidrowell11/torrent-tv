import { useEffect, useState } from 'react';
import { keyOf } from '../../core/library';
import { browseFreeClassics, type FreeTitle } from '../../core/sources/internetArchive';
import type { TitleInfo } from '../../core/types';
import { Icon } from '../components/Icon';
import { Poster, Shelf, SkeletonRow } from '../components/Poster';
import { useStore } from '../store';

const freeToInfo = (f: FreeTitle): TitleInfo => ({
  tmdbId: 0, iaId: f.iaId, kind: 'movie', title: f.title, year: f.year, overview: '', posterUrl: f.thumbUrl,
});

export function Discover({ open, goSettings }: { open(info: TitleInfo): void; goSettings(): void }) {
  const store = useStore();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<TitleInfo[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [trending, setTrending] = useState<TitleInfo[] | null>(null);
  const [classics, setClassics] = useState<FreeTitle[] | null>(null);
  const [classicTv, setClassicTv] = useState<FreeTitle[] | null>(null);
  const [error, setError] = useState<string>();

  useEffect(() => {
    const ac = new AbortController();
    store.tmdb?.trending('all', ac.signal).then(setTrending).catch((e) => !ac.signal.aborted && setError(String(e.message ?? e)));
    browseFreeClassics('feature_films', 24, undefined, ac.signal).then(setClassics).catch(() => setClassics([]));
    browseFreeClassics('classic_tv', 24, undefined, ac.signal).then(setClassicTv).catch(() => setClassicTv([]));
    return () => ac.abort();
  }, [store.tmdb]);

  // Debounced search as you type.
  useEffect(() => {
    if (!query.trim() || !store.tmdb) {
      setResults(null);
      return;
    }
    const ac = new AbortController();
    const t = setTimeout(() => {
      setSearching(true);
      store.tmdb!.search(query.trim(), ac.signal).then(setResults).catch(() => {}).finally(() => setSearching(false));
    }, 300);
    return () => {
      clearTimeout(t);
      ac.abort();
    };
  }, [query, store.tmdb]);

  const hero = trending?.find((t) => t.backdropUrl);
  const inLib = (i: TitleInfo) => store.state.library.find((l) => keyOf(l.info) === keyOf(i))?.status;

  return (
    <div className="discover">
      <section className="hero" style={hero ? { backgroundImage: `url(${hero.backdropUrl})` } : undefined}>
        <div className="hero-shade" />
        <div className="hero-content">
          {hero ? (
            <>
              <div className="eyebrow"><Icon name="sparkle" size={14} />Trending this week</div>
              <h1>{hero.title}</h1>
              <p className="hero-overview">{hero.overview}</p>
              <div className="actions">
                <button className="btn primary" onClick={() => open(hero)}>{hero.kind === 'tv' ? <><Icon name="bell" />Follow</> : <><Icon name="play" />View</>}</button>
                <button className="btn glass" onClick={() => open(hero)}>More info</button>
              </div>
            </>
          ) : (
            <>
              <div className="eyebrow"><Icon name="shieldCheck" size={14} />Safe by design</div>
              <h1>Your shows, delivered.</h1>
              <p className="hero-overview">Pick what you love. New episodes arrive on their own, every file is checked before it reaches you, and everything comes from sources you trust.</p>
            </>
          )}
          <label className="search">
            <Icon name="search" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={store.tmdb ? 'Search movies and TV shows' : 'Add a TMDB key in Settings to search everything'}
              disabled={!store.tmdb}
            />
            {searching && <span className="spinner" />}
          </label>
        </div>
      </section>

      {!store.tmdb && (
        <div className="callout">
          <Icon name="key" />
          <div><strong>Unlock search, artwork and episode tracking.</strong> Add your free TMDB key. Free classics below work without it.</div>
          <button className="btn small primary" onClick={goSettings}>Add key</button>
        </div>
      )}
      {error && <div className="callout warn"><Icon name="alert" />{error}</div>}

      {results ? (
        <section className="grid-section">
          <h2>Results for “{query}”</h2>
          {results.length === 0 ? <p className="muted">Nothing found. Try another title.</p> : (
            <div className="grid">{results.map((r) => <Poster key={keyOf(r)} info={r} status={inLib(r)} onOpen={() => open(r)} />)}</div>
          )}
        </section>
      ) : (
        <>
          {store.tmdb && (
            <Shelf title="Trending" subtitle="What everyone is watching this week">
              {trending ? trending.map((t) => <Poster key={keyOf(t)} info={t} status={inLib(t)} onOpen={() => open(t)} />) : <SkeletonRow />}
            </Shelf>
          )}
          <Shelf title="Free classic films" subtitle="Public domain, ready to download now from Internet Archive">
            {classics ? classics.map((c) => <Poster key={c.iaId} info={freeToInfo(c)} badge="Free" status={inLib(freeToInfo(c))} onOpen={() => open(freeToInfo(c))} />) : <SkeletonRow />}
          </Shelf>
          <Shelf title="Classic TV" subtitle="Vintage episodes in the public domain">
            {classicTv ? classicTv.map((c) => <Poster key={c.iaId} info={freeToInfo(c)} badge="Free" status={inLib(freeToInfo(c))} onOpen={() => open(freeToInfo(c))} />) : <SkeletonRow />}
          </Shelf>
        </>
      )}
    </div>
  );
}
