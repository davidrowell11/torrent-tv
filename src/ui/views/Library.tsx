import { useState } from 'react';
import { keyOf } from '../../core/library';
import type { LibraryItem, TitleInfo } from '../../core/types';
import { Icon } from '../components/Icon';
import { Poster } from '../components/Poster';
import { useStore } from '../store';

type Tab = 'all' | 'tv' | 'movie';

export function Library({ open, goDiscover }: { open(info: TitleInfo): void; goDiscover(): void }) {
  const { state, downloads, checkNow, tmdb } = useStore();
  const [tab, setTab] = useState<Tab>('all');
  const items = state.library.filter((i) => tab === 'all' || i.info.kind === tab);
  const shows = state.library.filter((i) => i.info.kind === 'tv');
  const progressOf = (i: LibraryItem) => downloads.find((d) => d.id === i.downloadId)?.progress;
  const newEpisodes = (i: LibraryItem) => i.episodes?.filter((e) => e.status === 'done').length ?? 0;

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

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Library</h1>
          <p className="muted">{shows.filter((s) => s.follow).length} shows followed · {state.library.length - shows.length} films</p>
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
      <div className="grid">
        {items.map((i) => (
          <Poster
            key={keyOf(i.info)}
            info={i.info}
            onOpen={() => open(i.info)}
            status={i.info.kind === 'movie' ? i.status : undefined}
            progress={i.info.kind === 'movie' ? progressOf(i) : undefined}
            badge={i.info.kind === 'tv' ? (i.follow ? (newEpisodes(i) ? `${newEpisodes(i)} ready` : 'Following') : 'Paused') : undefined}
          />
        ))}
      </div>
    </div>
  );
}
