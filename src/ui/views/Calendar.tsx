import { useEffect, useState } from 'react';
import { groupByDay, type CalendarDay, type CalendarEntry } from '../../core/calendar';
import { epCode, keyOf } from '../../core/library';
import type { TitleInfo } from '../../core/types';
import { Icon } from '../components/Icon';
import { useStore } from '../store';

export function Calendar({ open, goDiscover }: { open(info: TitleInfo): void; goDiscover(): void }) {
  const { state, tmdb } = useStore();
  const followed = state.library.filter((i) => i.info.kind === 'tv' && i.follow && i.info.tmdbId);
  const [days, setDays] = useState<CalendarDay[] | null>(null);
  const followedIds = followed.map((i) => i.info.tmdbId).join(',');

  useEffect(() => {
    if (!tmdb) return;
    const ac = new AbortController();
    Promise.all(
      followed.map(async (item) => {
        const eps = await tmdb.upcomingEpisodes(item.info.tmdbId, new Date(), ac.signal).catch(() => []);
        return eps.map<CalendarEntry>((e) => ({
          showKey: keyOf(item.info), showTitle: item.info.title, posterUrl: item.info.posterUrl,
          season: e.season, episode: e.episode, title: e.title, airDate: e.airDate!,
        }));
      }),
    ).then((all) => !ac.signal.aborted && setDays(groupByDay(all.flat())));
    return () => ac.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tmdb, followedIds]);

  if (!followed.length) {
    return (
      <div className="empty">
        <div className="empty-art"><Icon name="calendar" size={44} /></div>
        <h1>No shows followed yet</h1>
        <p className="muted">Follow a show and its upcoming episodes appear here. They download automatically on the day they air.</p>
        <button className="btn primary" onClick={goDiscover}><Icon name="discover" />Find a show</button>
      </div>
    );
  }

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Calendar</h1>
          <p className="muted">Upcoming episodes of the {followed.length} show{followed.length > 1 ? 's' : ''} you follow.</p>
        </div>
      </header>
      {!tmdb && <p className="muted">Add a TMDB key in Settings to see air dates.</p>}
      {tmdb && !days && <div className="cal-day skeleton-block" />}
      {days?.length === 0 && <p className="muted">Nothing scheduled yet for the shows you follow. New dates appear as networks announce them.</p>}
      <div className="calendar">
        {days?.map((d) => (
          <section key={d.date} className="cal-day">
            <h2 className={d.label === 'Today' ? 'today' : ''}>{d.label}</h2>
            <div className="cal-entries">
              {d.entries.map((e) => {
                const item = state.library.find((i) => keyOf(i.info) === e.showKey);
                return (
                  <button key={`${e.showKey}${e.season}x${e.episode}`} className="cal-entry" onClick={() => item && open(item.info)}>
                    {e.posterUrl ? <img src={e.posterUrl} alt="" loading="lazy" /> : <div className="cal-thumb"><Icon name="tv" /></div>}
                    <div>
                      <strong>{e.showTitle}</strong>
                      <span className="muted small">{epCode(e)}{e.title ? ` · ${e.title}` : ''}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
