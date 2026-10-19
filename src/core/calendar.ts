export interface CalendarEntry {
  showKey: string;
  showTitle: string;
  posterUrl?: string;
  season: number;
  episode: number;
  title?: string;
  airDate: string; // YYYY-MM-DD
}

export interface CalendarDay {
  date: string;
  label: string;
  entries: CalendarEntry[];
}

/** Group upcoming episodes by air date with friendly labels ("Today", "Tomorrow", "Fri 24 Oct"). */
export function groupByDay(entries: CalendarEntry[], today = new Date(), locale?: string): CalendarDay[] {
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const t0 = iso(today);
  const t1 = iso(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1));
  const byDate = new Map<string, CalendarEntry[]>();
  for (const e of entries) {
    if (e.airDate < t0) continue;
    byDate.set(e.airDate, [...(byDate.get(e.airDate) ?? []), e]);
  }
  return [...byDate.keys()].sort().map((date) => {
    const [y, m, d] = date.split('-').map(Number);
    const label = date === t0 ? 'Today' : date === t1 ? 'Tomorrow'
      : new Date(y, m - 1, d).toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short' });
    return { date, label, entries: byDate.get(date)!.sort((a, b) => a.showTitle.localeCompare(b.showTitle) || a.episode - b.episode) };
  });
}
