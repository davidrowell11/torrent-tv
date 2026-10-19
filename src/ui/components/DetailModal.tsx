import { useEffect, useMemo, useState } from 'react';
import { epCode, keyOf } from '../../core/library';
import type { EpisodeRef, TitleInfo, TorrentCandidate } from '../../core/types';
import { useStore } from '../store';
import { useConfirm } from './Confirm';
import { Icon } from './Icon';
import { StatusPill } from './Poster';

const resumeLabel = (p: { seconds: number }) => `${Math.floor(p.seconds / 60)}m`;
const fmtSize = (b?: number) => (!b ? '' : b > 1e9 ? `${(b / 1e9).toFixed(1)} GB` : `${Math.round(b / 1e6)} MB`);

export function DetailModal({ info: initial, onClose }: { info: TitleInfo; onClose(): void }) {
  const store = useStore();
  const confirm = useConfirm();
  const [info, setInfo] = useState(initial);
  const key = keyOf(info);
  const item = store.state.library.find((i) => keyOf(i.info) === key);
  const [candidates, setCandidates] = useState<TorrentCandidate[] | null>(null);
  const [looking, setLooking] = useState(false);
  const [aired, setAired] = useState<EpisodeRef[] | null>(null);
  const [season, setSeason] = useState<number | null>(null);

  // Fill in genres etc. from the full TMDB record.
  useEffect(() => {
    if (!store.tmdb) return;
    const ac = new AbortController();
    // Free classics come from Internet Archive by name: look up their artwork and info too.
    if (!initial.tmdbId) {
      store.tmdb.match(initial.kind, initial.title, initial.year, ac.signal)
        .then((m) => m && setInfo({ ...m, tmdbId: 0, iaId: initial.iaId }))
        .catch(() => {});
      return () => ac.abort();
    }
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

  const deleteMovieFile = async () => {
    const ok = await confirm(`Delete ${info.title} from this device?`, 'It stays in your library, so you can download it again any time.', [
      { value: 'yes', label: 'Delete file', tone: 'danger' },
    ]);
    if (ok) await store.deleteDownload(key);
  };

  const deleteEpisodeFile = async (e: EpisodeRef) => {
    const ok = await confirm(`Delete ${epCode(e)} from this device?`, undefined, [{ value: 'yes', label: 'Delete file', tone: 'danger' }]);
    if (ok) await store.deleteDownload(key, e);
  };

  const removeTitle = async () => {
    const hasFiles = item?.status === 'done' || item?.episodes?.some((e) => e.status === 'done');
    const choice = await confirm(
      `Remove ${info.title}?`,
      hasFiles ? 'You can also delete what you downloaded, or keep the files on this device.' : undefined,
      hasFiles
        ? [{ value: 'delete', label: 'Remove and delete files', tone: 'danger' }, { value: 'keep', label: 'Remove, keep files', tone: 'ghost' }]
        : [{ value: 'keep', label: 'Remove', tone: 'danger' }],
    );
    if (!choice) return;
    await store.remove(key, choice === 'delete');
    onClose();
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
              {item && info.kind === 'movie' && <StatusPill status={item.status} />}
            </div>
            <p className="overview">{info.overview || 'No description available.'}</p>

            <div className="actions">
              {info.kind === 'movie' && (
                <>
                  {item?.status === 'done' ? (
                    <button className="btn primary" onClick={() => store.play(key)}>
                      <Icon name="play" />{item.position && !item.watched ? `Resume ${resumeLabel(item.position)}` : 'Play'}
                    </button>
                  ) : (
                    <button className="btn primary" disabled={item?.status === 'downloading' || item?.status === 'searching'}
                      onClick={() => { ensureAdded(); store.get(key); }}>
                      <Icon name="download" />
                      {item?.status === 'downloading' ? 'Downloading…' : item?.status === 'searching' ? 'Searching…' : item?.status === 'removed' ? 'Download again' : 'Download'}
                    </button>
                  )}
                  {!item && <button className="btn ghost" onClick={ensureAdded}><Icon name="plus" />Add to library</button>}
                  {item && (
                    <button className={`btn ghost ${item.watched ? 'on' : ''}`} onClick={() => store.setWatched(key, undefined, !item.watched)}>
                      <Icon name="check" />{item.watched ? 'Watched' : 'Mark watched'}
                    </button>
                  )}
                  {!info.iaId && item?.status !== 'done' && (
                    <button className="btn ghost" onClick={lookForSources} disabled={looking}><Icon name="search" />{looking ? 'Searching…' : 'Choose source'}</button>
                  )}
                  {item?.status === 'done' && (
                    <button className="btn subtle" onClick={deleteMovieFile}><Icon name="trash" />Delete download</button>
                  )}
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
              {item && <button className="btn subtle" onClick={removeTitle}><Icon name="close" />Remove from library</button>}
            </div>
            {item?.note && item.status !== 'done' && <p className="note"><Icon name={item.status === 'blocked' ? 'alert' : 'shield'} size={16} />{item.note}</p>}
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
                      <li key={epCode(e)} className={st?.watched ? 'watched' : ''}>
                        <button className={`watch-dot ${st?.watched ? 'on' : ''}`} aria-label={st?.watched ? 'Mark unwatched' : 'Mark watched'}
                          title={st?.watched ? 'Watched' : 'Mark watched'}
                          onClick={() => { ensureAdded(); store.setWatched(key, e, !st?.watched); }}>
                          <Icon name="check" size={13} />
                        </button>
                        <span className="ep-code">{epCode(e)}</span>
                        <span className="ep-title">{e.title}<span className="muted small">{e.airDate}{st?.position && !st.watched ? ` · ${resumeLabel(st.position)} in` : ''}</span></span>
                        {st?.status === 'done' ? (
                          <span className="row-gap">
                            <button className="btn small primary" onClick={() => store.play(key, e)}><Icon name="play" size={14} />Play</button>
                            <button className="icon-btn" aria-label="Delete episode file" onClick={() => deleteEpisodeFile(e)}><Icon name="trash" size={16} /></button>
                          </span>
                        ) : st && st.status !== 'removed' && st.status !== 'not-found' ? <StatusPill status={st.status} /> : (
                          <button className="btn small ghost" onClick={() => { ensureAdded(); store.get(key, e); }}>
                            <Icon name="download" size={14} />{st?.status === 'removed' ? 'Again' : 'Get'}
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
