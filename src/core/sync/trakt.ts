import type { Fetcher } from '../sources/types';

/**
 * Optional Trakt (trakt.tv) sync so watched history follows the user between
 * devices. Users create their own free Trakt API app and sign in with Trakt's
 * device-code flow: the app shows a short code, the user enters it on trakt.tv.
 */

const API = 'https://api.trakt.tv';

export interface TraktAuth {
  clientId: string;
  clientSecret: string;
  accessToken?: string;
  refreshToken?: string;
  /** ms since epoch */
  expiresAt?: number;
  username?: string;
}

export interface DeviceCode {
  device_code: string;
  user_code: string;
  verification_url: string;
  expires_in: number;
  interval: number;
}

export type WatchedEvent =
  | { kind: 'movie'; tmdbId: number; watchedAt: string }
  | { kind: 'episode'; tmdbId: number; season: number; episode: number; watchedAt: string };

export interface WatchedHistory {
  movies: Set<number>;
  /** "tmdbId:season:episode" */
  episodes: Set<string>;
}

export const episodeId = (tmdbId: number, season: number, episode: number) => `${tmdbId}:${season}:${episode}`;

/** Group watched events into Trakt's /sync/history body. */
export function historyBody(events: WatchedEvent[]) {
  const movies = events.filter((e) => e.kind === 'movie').map((e) => ({ ids: { tmdb: e.tmdbId }, watched_at: e.watchedAt }));
  const shows = new Map<number, Map<number, { number: number; watched_at: string }[]>>();
  for (const e of events) {
    if (e.kind !== 'episode') continue;
    const seasons = shows.get(e.tmdbId) ?? new Map();
    seasons.set(e.season, [...(seasons.get(e.season) ?? []), { number: e.episode, watched_at: e.watchedAt }]);
    shows.set(e.tmdbId, seasons);
  }
  return {
    movies,
    shows: [...shows].map(([tmdb, seasons]) => ({
      ids: { tmdb },
      seasons: [...seasons].map(([number, episodes]) => ({ number, episodes })),
    })),
  };
}

export class Trakt {
  constructor(private auth: TraktAuth, private onAuth: (a: TraktAuth) => void, private fetcher: Fetcher = (u, i) => fetch(u, i)) {}

  private headers(): Record<string, string> {
    const h: Record<string, string> = { 'content-type': 'application/json', 'trakt-api-version': '2', 'trakt-api-key': this.auth.clientId };
    if (this.auth.accessToken) h.authorization = `Bearer ${this.auth.accessToken}`;
    return h;
  }

  private async call<T>(method: string, path: string, body?: unknown): Promise<T> {
    await this.refreshIfNeeded();
    const res = await this.fetcher(API + path, { method, headers: this.headers(), body: body ? JSON.stringify(body) : undefined });
    if (res.status === 401) throw new Error('Trakt sign-in expired. Connect again in Settings.');
    if (!res.ok) throw new Error(`Trakt request failed (${res.status})`);
    return (res.status === 204 ? undefined : await res.json()) as T;
  }

  async startDeviceLogin(): Promise<DeviceCode> {
    const res = await this.fetcher(`${API}/oauth/device/code`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ client_id: this.auth.clientId }),
    });
    if (!res.ok) throw new Error('Trakt did not accept that Client ID');
    return res.json();
  }

  /** Poll until the user approves, the code expires, or `signal` aborts. */
  async finishDeviceLogin(code: DeviceCode, signal?: AbortSignal, wait = (ms: number) => new Promise((r) => setTimeout(r, ms))): Promise<TraktAuth> {
    let interval = code.interval * 1000;
    const deadline = Date.now() + code.expires_in * 1000;
    while (Date.now() < deadline) {
      if (signal?.aborted) throw new Error('Cancelled');
      await wait(interval);
      const res = await this.fetcher(`${API}/oauth/device/token`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code: code.device_code, client_id: this.auth.clientId, client_secret: this.auth.clientSecret }),
      });
      if (res.status === 200) {
        const t = (await res.json()) as { access_token: string; refresh_token: string; expires_in: number };
        this.auth = { ...this.auth, accessToken: t.access_token, refreshToken: t.refresh_token, expiresAt: Date.now() + t.expires_in * 1000 };
        const me = await this.call<{ user: { username: string } }>('GET', '/users/settings').catch(() => undefined);
        this.auth.username = me?.user.username;
        this.onAuth(this.auth);
        return this.auth;
      }
      if (res.status === 429) interval += 1000;
      else if (res.status === 418) throw new Error('Sign-in was declined on Trakt');
      else if (res.status === 410 || res.status === 404) throw new Error('The code expired. Try again.');
      // 400 = still waiting for the user
    }
    throw new Error('The code expired. Try again.');
  }

  private async refreshIfNeeded() {
    const a = this.auth;
    if (!a.refreshToken || !a.expiresAt || a.expiresAt - Date.now() > 24 * 3600_000) return;
    const res = await this.fetcher(`${API}/oauth/token`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        refresh_token: a.refreshToken, client_id: a.clientId, client_secret: a.clientSecret,
        redirect_uri: 'urn:ietf:wg:oauth:2.0:oob', grant_type: 'refresh_token',
      }),
    });
    if (!res.ok) return;
    const t = (await res.json()) as { access_token: string; refresh_token: string; expires_in: number };
    this.auth = { ...a, accessToken: t.access_token, refreshToken: t.refresh_token, expiresAt: Date.now() + t.expires_in * 1000 };
    this.onAuth(this.auth);
  }

  addToHistory(events: WatchedEvent[]) {
    return this.call('POST', '/sync/history', historyBody(events));
  }

  removeFromHistory(events: WatchedEvent[]) {
    return this.call('POST', '/sync/history/remove', historyBody(events));
  }

  async watched(): Promise<WatchedHistory> {
    const [movies, shows] = await Promise.all([
      this.call<{ movie: { ids: { tmdb?: number } } }[]>('GET', '/sync/watched/movies'),
      this.call<{ show: { ids: { tmdb?: number } }; seasons: { number: number; episodes: { number: number }[] }[] }[]>('GET', '/sync/watched/shows'),
    ]);
    const out: WatchedHistory = { movies: new Set(), episodes: new Set() };
    for (const m of movies) if (m.movie.ids.tmdb) out.movies.add(m.movie.ids.tmdb);
    for (const s of shows) {
      const id = s.show.ids.tmdb;
      if (!id) continue;
      for (const season of s.seasons) for (const e of season.episodes) out.episodes.add(episodeId(id, season.number, e.number));
    }
    return out;
  }
}
