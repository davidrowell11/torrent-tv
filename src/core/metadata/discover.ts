import type { MediaKind } from '../types';

export type SortBy = 'popular' | 'newest' | 'top';
export type YearRange = 'any' | 'this' | 'last' | '2020s' | '2010s' | '2000s' | '1990s' | 'older';

export interface DiscoverFilters {
  kind: MediaKind;
  genreId?: number;
  year: YearRange;
  /** Minimum TMDB rating, 0 = any. */
  minRating: number;
  /** ISO 639-1 original language, '' = any. */
  language: string;
  sort: SortBy;
}

export const defaultFilters: DiscoverFilters = { kind: 'movie', year: 'any', minRating: 0, language: '', sort: 'popular' };

export const LANGUAGES: [string, string][] = [
  ['', 'Language'], ['en', 'English'], ['es', 'Spanish'], ['fr', 'French'], ['de', 'German'], ['it', 'Italian'],
  ['ja', 'Japanese'], ['ko', 'Korean'], ['zh', 'Chinese'], ['hi', 'Hindi'], ['pt', 'Portuguese'], ['sv', 'Swedish'],
  ['da', 'Danish'], ['no', 'Norwegian'], ['nl', 'Dutch'], ['tr', 'Turkish'], ['ar', 'Arabic'],
];

export const YEARS: [YearRange, string][] = [
  ['any', 'Any year'], ['this', 'This year'], ['last', 'Last year'], ['2020s', '2020s'], ['2010s', '2010s'],
  ['2000s', '2000s'], ['1990s', '1990s'], ['older', 'Before 1990'],
];

function yearBounds(y: YearRange, today: Date): [string?, string?] {
  const now = today.getFullYear();
  switch (y) {
    case 'this': return [`${now}-01-01`, undefined];
    case 'last': return [`${now - 1}-01-01`, `${now - 1}-12-31`];
    case '2020s': return ['2020-01-01', '2029-12-31'];
    case '2010s': return ['2010-01-01', '2019-12-31'];
    case '2000s': return ['2000-01-01', '2009-12-31'];
    case '1990s': return ['1990-01-01', '1999-12-31'];
    case 'older': return [undefined, '1989-12-31'];
    default: return [undefined, undefined];
  }
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** TMDB /discover query for the chosen filters. Never includes titles that haven't come out yet. */
export function discoverParams(f: DiscoverFilters, page = 1, today = new Date()): Record<string, string> {
  const dateKey = f.kind === 'movie' ? 'primary_release_date' : 'first_air_date';
  const [from, to] = yearBounds(f.year, today);
  const latest = to && to < iso(today) ? to : iso(today);
  const p: Record<string, string> = {
    include_adult: 'false',
    page: String(page),
    sort_by: f.sort === 'newest' ? `${dateKey}.desc` : f.sort === 'top' ? 'vote_average.desc' : 'popularity.desc',
    [`${dateKey}.lte`]: latest,
  };
  if (from) p[`${dateKey}.gte`] = from;
  if (f.genreId) p.with_genres = String(f.genreId);
  if (f.language) p.with_original_language = f.language;
  if (f.minRating > 0) p['vote_average.gte'] = String(f.minRating);
  // Ratings from a handful of votes are noise; "newest" still needs a few so obscure uploads don't flood it.
  p['vote_count.gte'] = f.sort === 'top' || f.minRating > 0 ? '200' : f.sort === 'newest' ? '20' : '0';
  return p;
}

/** Recently released, reasonably popular titles for the "New" shelves. */
export function newReleaseParams(kind: MediaKind, today = new Date(), days = kind === 'movie' ? 90 : 60): Record<string, string> {
  const dateKey = kind === 'movie' ? 'primary_release_date' : 'first_air_date';
  const from = new Date(today.getTime() - days * 86_400_000);
  return {
    include_adult: 'false',
    sort_by: 'popularity.desc',
    [`${dateKey}.gte`]: iso(from),
    [`${dateKey}.lte`]: iso(today),
    'vote_count.gte': kind === 'movie' ? '20' : '5',
  };
}
