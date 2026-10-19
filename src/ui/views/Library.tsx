import { useState } from 'react';
import { epCode, keyOf } from '../../core/library';
import type { LibraryEpisode, LibraryItem, PlaybackPosition, TitleInfo } from '../../core/types';
import { Icon } from '../components/Icon';
import { Poster } from '../components/Poster';
import { useStore } from '../store';

type Tab = 'all' | 'tv' | 'movie';
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
interface ContinueEntry { key: string; item: LibraryItem; ep?: LibraryEpisode; pos: PlaybackPosition }

export function Library({ open, goDiscover }: { open(info: TitleInfo): void; goDiscover(): void }) {
  const { state, downloads, checkNow, tmdb, play } = useStore();
  const [tab, setTab] = useState<Tab>('all');
  const items = state.library.filter((i) => tab === 'all' || i.info.kind === tab);
  const shows = state.library.filter((i) => i.info.kind === 'tv');
  const progressOf = (i: LibraryItem) => downloads.find((d) => d.id === i.downloadId)?.progress;
  const newEpisodes = (i: LibraryItem) => i.episodes?.filter((e) => e.status === 'done' && !e.watched).length ?? 0;

  if (state.library.length === 0) {
    return (
      <div className="empty">
        <div className="empty-art"><Icon name="library" size={44} /></div>
        <h1>Your library is empty</h1>
        <p className="muted">Follow a show and new episodes will appear here as they air. Add films to download them.</p>
        <button className="btn primary" onClick={goDiscover}><Icon name="discover" />Discover something</button>
      </div>
    );
  }

  // Started but not finished, most recent first.
  const continueWatching = state.library.flatMap((i): ContinueEntry[] => {
    const key = keyOf(i.info);
    if (i.info.kind === 'movie') return i.status === 'done' && i.position && !i.watched ? [{ key, item: i, ep: undefined, pos: i.position }] : [];
    return (i.episodes ?? []).filter((e) => e.status === 'done' && e.position && !e.watched).map((e) => ({ key, item: i, ep: e, pos: e.position! }));
  }).sort((a, b) => b.pos.updatedAt.localeCompare(a.pos.updatedAt)).slice(0, 10);

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Library</h1>
          <p className="muted">{plural(shows.filter((s) => s.follow).length, 'show')} followed · {plural(state.library.length - shows.length, 'film')}</p>
        </div>
        <div className="head-actions">
          <div className="segmented">
            {(['all', 'tv', 'movie'] as Tab[]).map((t) => (
              <button key={t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>{t === 'all' ? 'All' : t === 'tv' ? 'Shows' : 'Films'}</button>
            ))}
          </div>
          {tmdb && shows.length > 0 && (
            <button className="btn ghost small" onClick={() => shows.forEach((s) => checkNow(keyOf(s.info)))}><Icon name="refresh" size={16} />Check for new episodes</button>
          )}
        </div>
      </header>
      {continueWatching.length > 0 && tab !== 'movie' && tab !== 'tv' && (
        <section className="continue">
          <h2>Continue watching</h2>
          <div className="continue-row">
            {continueWatching.map(({ key, item, ep, pos }) => (
              <button key={`${key}${ep ? epCode(ep) : ''}`} className="continue-card" onClick={() => play(key, ep)}>
                <div className="continue-art" style={item.info.backdropUrl ? { backgroundImage: `url(${item.info.backdropUrl})` } : undefined}>
                  <span className="continue-play"><Icon name="play" size={22} /></span>
                  <div className="continue-bar"><i style={{ width: `${Math.min(100, (pos.seconds / pos.duration) * 100)}%` }} /></div>
                </div>
                <strong>{item.info.title}</strong>
                <span className="muted small">{ep ? `${epCode(ep)}${ep.title ? ` · ${ep.title}` : ''}` : `${Math.round((pos.duration - pos.seconds) / 60)} min left`}</span>
              </button>
            ))}
          </div>
        </section>
      )}
      <div className="grid">
        {items.map((i) => (
          <Poster
            key={keyOf(i.info)}
            info={i.info}
            onOpen={() => open(i.info)}
            status={i.info.kind === 'movie' ? i.status : undefined}
            progress={i.info.kind === 'movie' ? progressOf(i) : undefined}
            badge={i.info.kind === 'tv' ? (i.follow ? (newEpisodes(i) ? `${newEpisodes(i)} to watch` : 'Following') : 'Paused') : i.watched ? 'Watched' : undefined}
          />
        ))}
      </div>
    </div>
  );
}
