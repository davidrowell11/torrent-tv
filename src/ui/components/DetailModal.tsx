import { useEffect, useMemo, useState } from 'react';
import { epCode, keyOf } from '../../core/library';
import type { EpisodeRef, TitleInfo, TorrentCandidate } from '../../core/types';
import { useStore } from '../store';
import { Icon } from './Icon';
import { StatusPill } from './Poster';

const fmtSize = (b?: number) => (!b ? '' : b > 1e9 ? `${(b / 1e9).toFixed(1)} GB` : `${Math.round(b / 1e6)} MB`);

export function DetailModal({ info: initial, onClose }: { info: TitleInfo; onClose(): void }) {
  const store = useStore();
  const [info, setInfo] = useState(initial);
  const key = keyOf(info);
  const item = store.state.library.find((i) => keyOf(i.info) === key);
  const [candidates, setCandidates] = useState<TorrentCandidate[] | null>(null);
  const [looking, setLooking] = useState(false);
  const [aired, setAired] = useState<EpisodeRef[] | null>(null);
  const [season, setSeason] = useState<number | null>(null);

  // Fill in genres etc. from the full TMDB record.
  useEffect(() => {
    if (!store.tmdb || !initial.tmdbId) return;
    const ac = new AbortController();
    store.tmdb.details(initial.kind, initial.tmdbId, ac.signal).then(setInfo).catch(() => {});
    if (initial.kind === 'tv') {
      store.tmdb.airedEpisodes(initial.tmdbId, new Date(), ac.signal).then((eps) => {
        setAired(eps);
        setSeason(eps.at(-1)?.season ?? 1);
      }).catch(() => setAired([]));
    }
    return () => ac.abort();
  }, [store.tmdb, initial]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const seasons = useMemo(() => [...new Set((aired ?? []).map((e) => e.season))], [aired]);
  const epStatus = (e: EpisodeRef) => item?.episodes?.find((x) => x.season === e.season && x.episode === e.episode);

  async function lookForSources() {
    setLooking(true);
    try {
      setCandidates(await store.findCandidates({ kind: 'movie', title: info.title, year: info.year }));
    } catch {
      setCandidates([]);
    } finally {
      setLooking(false);
    }
  }

  const ensureAdded = () => {
    if (!item) store.add(info);
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <article className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={info.title}>
        <div className="modal-hero" style={info.backdropUrl ? { backgroundImage: `url(${info.backdropUrl})` } : undefined}>
          <div className="modal-hero-shade" />
          <button className="icon-btn modal-close" onClick={onClose} aria-label="Close"><Icon name="close" /></button>
        </div>
        <div className="modal-body">
          <div className="modal-poster">
            {info.posterUrl ? <img src={info.posterUrl} alt="" /> : <div className="poster-fallback"><Icon name={info.kind === 'tv' ? 'tv' : 'film'} size={40} /></div>}
          </div>
          <div className="modal-info">
            <div className="eyebrow">{info.kind === 'tv' ? 'Series' : 'Film'}{info.iaId ? ' · Public domain' : ''}</div>
            <h1>{info.title}</h1>
            <div className="meta-row">
              {info.year && <span>{info.year}</span>}
              {info.rating ? <span className="meta-rating"><Icon name="star" size={14} />{info.rating.toFixed(1)}</span> : null}
              {info.genres?.slice(0, 3).map((g) => <span key={g} className="chip">{g}</span>)}
              {item && <StatusPill status={item.status} />}
            </div>
            <p className="overview">{info.overview || 'No description available.'}</p>

            <div className="actions">
              {info.kind === 'movie' && (
                <>
                  <button className="btn primary" disabled={item?.status === 'downloading' || item?.status === 'searching'}
                    onClick={() => { ensureAdded(); store.get(key); }}>
                    <Icon name={item?.status === 'done' ? 'check' : 'download'} />
                    {item?.status === 'done' ? 'Downloaded' : item?.status === 'downloading' ? 'Downloading…' : 'Download'}
                  </button>
                  {!info.iaId && <button className="btn ghost" onClick={lookForSources} disabled={looking}><Icon name="search" />{looking ? 'Searching…' : 'Choose source'}</button>}
                </>
              )}
              {info.kind === 'tv' && (
                item ? (
                  <button className={`btn ${item.follow ? 'ghost' : 'primary'}`} onClick={() => store.setFollow(key, !item.follow)}>
                    <Icon name={item.follow ? 'check' : 'bell'} />{item.follow ? 'Following' : 'Follow'}
                  </button>
                ) : (
                  <button className="btn primary" onClick={ensureAdded}><Icon name="bell" />Follow show</button>
                )
              )}
              {item && <button className="btn subtle" onClick={() => { store.remove(key); onClose(); }}><Icon name="trash" />Remove</button>}
            </div>
            {item?.note && <p className="note"><Icon name={item.status === 'blocked' ? 'alert' : 'shield'} size={16} />{item.note}</p>}
            {info.kind === 'tv' && item?.follow && (
              <p className="hint">New episodes download automatically as they air.{' '}
                <button className="link" onClick={() => store.setFollow(key, true, true)}>Get every episode from the start</button>
              </p>
            )}

            {candidates && (
              <div className="candidates">
                <h3>Available from trusted sources</h3>
                {candidates.length === 0 && <p className="muted">No trusted source has this title yet. Add it to your library and we'll keep looking.</p>}
                {candidates.slice(0, 6).map((c) => (
                  <div key={c.torrentUrl} className="candidate">
                    <div>
                      <strong>{c.name}</strong>
                      <span className="muted small">{store.state.settings.customSources.find((s) => s.id === c.sourceId)?.name ?? 'Internet Archive'} · {fmtSize(c.sizeBytes)}{c.seeders !== undefined ? ` · ${c.seeders} seeders` : ''}</span>
                    </div>
                    <button className="btn small primary" onClick={() => { ensureAdded(); store.get(key, undefined, c); setCandidates(null); }}>
                      <Icon name="download" size={16} />Get
                    </button>
                  </div>
                ))}
              </div>
            )}

            {info.kind === 'tv' && aired && aired.length > 0 && (
              <div className="episodes">
                <div className="season-tabs">
                  {seasons.map((s) => <button key={s} className={s === season ? 'active' : ''} onClick={() => setSeason(s)}>Season {s}</button>)}
                </div>
                <ul>
                  {aired.filter((e) => e.season === season).reverse().map((e) => {
                    const st = epStatus(e);
                    return (
                      <li key={epCode(e)}>
                        <span className="ep-code">{epCode(e)}</span>
                        <span className="ep-title">{e.title}<span className="muted small">{e.airDate}</span></span>
                        {st ? <StatusPill status={st.status} /> : (
                          <button className="btn small ghost" onClick={() => { ensureAdded(); store.get(key, e); }}>
                            <Icon name="download" size={14} />Get
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>
        </div>
      </article>
    </div>
  );
}
