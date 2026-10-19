import type { LibraryItemStatus, TitleInfo } from '../../core/types';
import { Icon } from './Icon';

const statusLabel: Record<LibraryItemStatus, string> = {
  wanted: 'Queued', searching: 'Searching', downloading: 'Downloading', done: 'Ready', 'not-found': 'Waiting for source', blocked: 'Blocked', removed: 'Deleted',
};

export function StatusPill({ status }: { status: LibraryItemStatus }) {
  return <span className={`pill pill-${status}`}>{statusLabel[status]}</span>;
}

export function Poster({ info, onOpen, badge, status, progress }: {
  info: Pick<TitleInfo, 'title' | 'year' | 'posterUrl' | 'rating' | 'kind'>;
  onOpen(): void;
  badge?: string;
  status?: LibraryItemStatus;
  progress?: number;
}) {
  return (
    <button className="poster" onClick={onOpen} title={info.title}>
      <div className="poster-art">
        {info.posterUrl ? <img src={info.posterUrl} alt="" loading="lazy" /> : (
          <div className="poster-fallback"><Icon name={info.kind === 'tv' ? 'tv' : 'film'} size={34} /><span>{info.title}</span></div>
        )}
        <div className="poster-shade" />
        {info.rating ? <span className="rating"><Icon name="star" size={12} />{info.rating.toFixed(1)}</span> : null}
        {badge && <span className="badge">{badge}</span>}
        {status && <div className="poster-status"><StatusPill status={status} /></div>}
        {progress !== undefined && progress < 1 && <div className="poster-progress"><i style={{ width: `${progress * 100}%` }} /></div>}
      </div>
      <div className="poster-meta">
        <span className="poster-title">{info.title}</span>
        <span className="poster-sub">{info.year ?? ''}{info.kind === 'tv' ? ' · Series' : ''}</span>
      </div>
    </button>
  );
}

export function Shelf({ title, subtitle, children, action }: { title: string; subtitle?: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="shelf">
      <header className="shelf-head">
        <div>
          <h2>{title}</h2>
          {subtitle && <p className="muted">{subtitle}</p>}
        </div>
        {action}
      </header>
      <div className="shelf-row">{children}</div>
    </section>
  );
}

export function SkeletonRow({ count = 8 }: { count?: number }) {
  return <>{Array.from({ length: count }, (_, i) => <div key={i} className="poster skeleton"><div className="poster-art" /><div className="sk-line" /></div>)}</>;
}
