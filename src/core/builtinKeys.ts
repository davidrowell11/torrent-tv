/**
 * Keys baked in at build time from the repository secrets TMDB_API_KEY and OMDB_API_KEY,
 * so artwork, ratings and recommendations work without any setup. A key the user enters in
 * Settings always wins. Anyone with the app can read a built-in key; these are free,
 * rate-limited keys, so the worst case is someone using up the daily quota.
 */
export const BUILT_IN_KEYS = {
  tmdb: (import.meta.env.VITE_TMDB_KEY as string | undefined)?.trim() ?? '',
  omdb: (import.meta.env.VITE_OMDB_KEY as string | undefined)?.trim() ?? '',
};
