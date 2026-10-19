import { useEffect, useRef, useState } from 'react';
import { notificationsSupported, requestNotifications } from '../../core/notify';
import { Trakt, type DeviceCode } from '../../core/sync/trakt';
import { fmtBytes } from './Downloads';
import { Tmdb } from '../../core/metadata/tmdb';
import { builtInSources } from '../../core/sources/registry';
import { validateTorznabUrl } from '../../core/sources/torznab';
import { Icon } from '../components/Icon';
import { useStore } from '../store';

function Toggle({ on, onChange, label }: { on: boolean; onChange(v: boolean): void; label: string }) {
  return (
    <button role="switch" aria-checked={on} aria-label={label} className={`toggle ${on ? 'on' : ''}`} onClick={() => onChange(!on)}>
      <i />
    </button>
  );
}

export function Settings() {
  const { state, updateSettings, toast, vpn, scanner, engineKind, storageUsed, trakt, syncTrakt } = useStore();
  const s = state.settings;
  const [key, setKey] = useState(s.tmdbKey);
  const [testing, setTesting] = useState(false);
  const [feed, setFeed] = useState({ name: '', url: '', apiKey: '', minSeeders: 10 });
  const [ack, setAck] = useState(false);
  const feedError = feed.url ? validateTorznabUrl(feed.url) : undefined;

  // Trakt sign-in with a short code entered on trakt.tv.
  const [traktIds, setTraktIds] = useState({ clientId: s.trakt?.clientId ?? '', clientSecret: s.trakt?.clientSecret ?? '' });
  const [code, setCode] = useState<DeviceCode | null>(null);
  const cancelLogin = useRef<AbortController | null>(null);
  async function connectTrakt() {
    const t = new Trakt(traktIds, (auth) => updateSettings({ trakt: auth }));
    try {
      const c = await t.startDeviceLogin();
      setCode(c);
      cancelLogin.current = new AbortController();
      const auth = await t.finishDeviceLogin(c, cancelLogin.current.signal);
      toast(`Connected to Trakt${auth.username ? ` as ${auth.username}` : ''}`, 'good');
    } catch (e) {
      if (!cancelLogin.current?.signal.aborted) toast(e instanceof Error ? e.message : String(e), 'warn');
    } finally {
      setCode(null);
    }
  }
  useEffect(() => () => cancelLogin.current?.abort(), []);

  // "Install app" button when the browser offers it (Android, Chrome, Edge).
  const [installPrompt, setInstallPrompt] = useState<(Event & { prompt(): Promise<void> }) | null>(null);
  useEffect(() => {
    const on = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as Event & { prompt(): Promise<void> });
    };
    window.addEventListener('beforeinstallprompt', on);
    return () => window.removeEventListener('beforeinstallprompt', on);
  }, []);
  const standalone = typeof window !== 'undefined' && window.matchMedia?.('(display-mode: standalone)').matches;

  async function saveKey() {
    setTesting(true);
    try {
      await new Tmdb(key.trim()).trending('movie');
      updateSettings({ tmdbKey: key.trim() });
      toast('TMDB connected. Artwork and search are on.', 'good');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'That key did not work', 'warn');
    } finally {
      setTesting(false);
    }
  }

  function addFeed() {
    if (feedError || !feed.name || !feed.url || !ack) return;
    const id = `torznab-${crypto.randomUUID().slice(0, 8)}`;
    updateSettings({ customSources: [...s.customSources, { id, ...feed }], enabledSources: { ...s.enabledSources, [id]: true } });
    setFeed({ name: '', url: '', apiKey: '', minSeeders: 10 });
    setAck(false);
    toast(`Added ${feed.name}`, 'good');
  }

  return (
    <div className="page settings">
      <header className="page-head"><div><h1>Settings</h1><p className="muted">Everything stays on this device.</p></div></header>

      <section className="card">
        <h2><Icon name="key" />Artwork and info</h2>
        <p className="muted">Vidora uses The Movie Database for posters, descriptions and episode schedules. Get a free key at <a href="https://www.themoviedb.org/settings/api" target="_blank" rel="noreferrer">themoviedb.org</a>, then paste it here.</p>
        <div className="field-row">
          <input type="password" value={key} onChange={(e) => setKey(e.target.value)} placeholder="TMDB API key or read access token" autoComplete="off" spellCheck={false} />
          <button className="btn primary" onClick={saveKey} disabled={!key.trim() || testing}>{testing ? 'Checking…' : s.tmdbKey ? 'Update' : 'Connect'}</button>
        </div>
        {s.tmdbKey && <p className="ok-text small"><Icon name="check" size={14} />Connected</p>}
      </section>

      <section className="card">
        <h2><Icon name="shieldCheck" />Safety</h2>
        <div className="setting">
          <div>
            <strong>Virus scan every download</strong>
            <p className="muted small">
              {engineKind === 'desktop'
                ? scanner ? `Using ${scanner}. Files stay in quarantine until they pass.` : 'No scanner found. Install ClamAV (Mac, Linux, Chromebook) or turn on Microsoft Defender (Windows). Files wait in quarantine until one is available.'
                : 'Available in the desktop app. In the browser, every file is still checked to be a real video before you can play or save it.'}
            </p>
          </div>
          <Toggle label="Virus scan" on={s.requireVirusScan} onChange={(v) => updateSettings({ requireVirusScan: v })} />
        </div>
        <div className="setting">
          <div>
            <strong>Only download while a VPN is on</strong>
            <p className="muted small">
              {vpn.supported
                ? vpn.connected ? `VPN detected (${vpn.interfaceName}).` : 'No VPN detected right now. Downloads pause until one connects.'
                : 'VPN detection needs the desktop app. Browser downloads only use secure web connections.'}
            </p>
          </div>
          <Toggle label="Require VPN" on={s.requireVpn} onChange={(v) => updateSettings({ requireVpn: v })} />
        </div>
        <div className="setting">
          <div><strong>Always on</strong><p className="muted small">Only video and subtitle files are ever saved. Programs, scripts, archives and disguised files are skipped, and each file's contents are checked to be a real video.</p></div>
          <Icon name="check" />
        </div>
      </section>

      <section className="card">
        <h2><Icon name="refresh" />Automatic episodes</h2>
        <div className="setting">
          <div><strong>Check for new episodes every</strong></div>
          <select value={s.checkEveryHours} onChange={(e) => updateSettings({ checkEveryHours: Number(e.target.value) })}>
            {[1, 3, 6, 12, 24].map((h) => <option key={h} value={h}>{h === 1 ? 'hour' : `${h} hours`}</option>)}
          </select>
        </div>
        <div className="setting">
          <div><strong>Downloads at once</strong></div>
          <select value={s.maxActive} onChange={(e) => updateSettings({ maxActive: Number(e.target.value) })}>
            {[1, 2, 3, 4, 6].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
      </section>

      <section className="card">
        <h2><Icon name="film" />Quality</h2>
        <div className="setting">
          <div><strong>Preferred quality</strong><p className="muted small">Used when a source offers more than one version. 720p is a good fit for phones.</p></div>
          <select value={s.quality.preferred} onChange={(e) => updateSettings({ quality: { ...s.quality, preferred: e.target.value as typeof s.quality.preferred } })}>
            <option value="any">Best available</option>
            <option value="480p">480p (smallest)</option>
            <option value="720p">720p HD</option>
            <option value="1080p">1080p Full HD</option>
            <option value="2160p">4K</option>
          </select>
        </div>
        <div className="setting">
          <div><strong>Largest file to download</strong><p className="muted small">Anything bigger is skipped.</p></div>
          <select value={s.quality.maxSizeGB} onChange={(e) => updateSettings({ quality: { ...s.quality, maxSizeGB: Number(e.target.value) } })}>
            {[1, 2, 4, 8, 15, 30, 0].map((g) => <option key={g} value={g}>{g ? `${g} GB` : 'No limit'}</option>)}
          </select>
        </div>
      </section>

      <section className="card">
        <h2><Icon name="disk" />Storage</h2>
        <div className="setting">
          <div><strong>Delete after watching</strong><p className="muted small">Frees space automatically once you've watched something. {storageUsed > 0 ? `${fmtBytes(storageUsed)} used now.` : ''}</p></div>
          <select value={s.cleanup.afterWatchDays} onChange={(e) => updateSettings({ cleanup: { ...s.cleanup, afterWatchDays: Number(e.target.value) } })}>
            <option value={-1}>Never</option>
            <option value={0}>Right away</option>
            <option value={1}>After 1 day</option>
            <option value={7}>After 1 week</option>
            <option value={30}>After 30 days</option>
          </select>
        </div>
        <div className="setting">
          <div><strong>Include films</strong><p className="muted small">Off: only TV episodes are cleaned up.</p></div>
          <Toggle label="Include films in cleanup" on={s.cleanup.includeFilms} onChange={(v) => updateSettings({ cleanup: { ...s.cleanup, includeFilms: v } })} />
        </div>
      </section>

      <section className="card">
        <h2><Icon name="bell" />Notifications</h2>
        <div className="setting">
          <div>
            <strong>Tell me when something is ready to watch</strong>
            <p className="muted small">{notificationsSupported() ? 'Works while Vidora is open or running in the background.' : "This browser doesn't support notifications."}</p>
          </div>
          <Toggle label="Notifications" on={s.notifications} onChange={async (v) => {
            if (v && !(await requestNotifications())) {
              toast('Notifications are blocked. Allow them in your browser or phone settings.', 'warn');
              return;
            }
            updateSettings({ notifications: v });
          }} />
        </div>
      </section>

      <section className="card">
        <h2><Icon name="sync" />Watched history (Trakt)</h2>
        {trakt && s.trakt ? (
          <>
            <p className="ok-text small"><Icon name="check" size={14} />Connected{s.trakt.username ? ` as ${s.trakt.username}` : ''}. What you watch here is added to Trakt, and Trakt history marks titles watched here.</p>
            <div className="actions">
              <button className="btn small ghost" onClick={syncTrakt}><Icon name="refresh" size={16} />Sync now</button>
              <button className="btn small subtle" onClick={() => updateSettings({ trakt: undefined })}>Disconnect</button>
            </div>
          </>
        ) : code ? (
          <div className="trakt-code">
            <p>Go to <a href={code.verification_url} target="_blank" rel="noreferrer">{code.verification_url}</a> and enter:</p>
            <div className="code">{code.user_code}</div>
            <p className="muted small">Waiting for you to approve… <button className="link" onClick={() => cancelLogin.current?.abort()}>Cancel</button></p>
          </div>
        ) : (
          <>
            <p className="muted">Optional. Keeps what you've watched in sync across devices and other apps. Create a free API app at <a href="https://trakt.tv/oauth/applications/new" target="_blank" rel="noreferrer">trakt.tv</a> (redirect URI: <code>urn:ietf:wg:oauth:2.0:oob</code>), then paste its Client ID and Secret.</p>
            <div className="form-grid">
              <input placeholder="Client ID" value={traktIds.clientId} onChange={(e) => setTraktIds({ ...traktIds, clientId: e.target.value.trim() })} autoComplete="off" spellCheck={false} />
              <input type="password" placeholder="Client Secret" value={traktIds.clientSecret} onChange={(e) => setTraktIds({ ...traktIds, clientSecret: e.target.value.trim() })} autoComplete="off" />
            </div>
            <button className="btn small primary" disabled={!traktIds.clientId || !traktIds.clientSecret} onClick={connectTrakt}>Connect Trakt</button>
          </>
        )}
      </section>

      <section className="card">
        <h2><Icon name="phone" />Get the app</h2>
        {standalone ? (
          <p className="ok-text small"><Icon name="check" size={14} />You're using the installed app.</p>
        ) : installPrompt ? (
          <div className="setting">
            <div><strong>Install Vidora on this device</strong><p className="muted small">Adds it to your home screen or app list, opens full screen, works offline for downloaded videos.</p></div>
            <button className="btn small primary" onClick={() => installPrompt.prompt()}><Icon name="download" size={16} />Install</button>
          </div>
        ) : (
          <p className="muted small">On Android, open your browser menu (⋮) and tap <strong>Install app</strong> or <strong>Add to Home screen</strong>. On iPhone, tap Share then <strong>Add to Home Screen</strong>.</p>
        )}
        <p className="muted small">Prefer a downloadable app? Windows, Mac, Linux and Android versions are on the <a href="https://github.com/davidrowell11/torrent-tv/releases/latest" target="_blank" rel="noreferrer">releases page</a>. <a href="https://github.com/davidrowell11/torrent-tv/blob/main/docs/INSTALL.md" target="_blank" rel="noreferrer">Step-by-step instructions</a>.</p>
      </section>

      <section className="card">
        <h2><Icon name="globe" />Sources</h2>
        {builtInSources.map((src) => (
          <div className="setting" key={src.id}>
            <div><strong>{src.name} <span className="chip good">Verified legal</span></strong><p className="muted small">{src.description}</p></div>
            <Toggle label={src.name} on={s.enabledSources[src.id] !== false} onChange={(v) => updateSettings({ enabledSources: { ...s.enabledSources, [src.id]: v } })} />
          </div>
        ))}
        {s.customSources.map((src) => (
          <div className="setting" key={src.id}>
            <div><strong>{src.name} <span className="chip">Your feed</span></strong><p className="muted small">{new URL(src.url).host} · at least {src.minSeeders} seeders</p></div>
            <div className="row-gap">
              <Toggle label={src.name} on={s.enabledSources[src.id] !== false} onChange={(v) => updateSettings({ enabledSources: { ...s.enabledSources, [src.id]: v } })} />
              <button className="icon-btn" aria-label={`Remove ${src.name}`} onClick={() => updateSettings({ customSources: s.customSources.filter((c) => c.id !== src.id) })}><Icon name="trash" size={18} /></button>
            </div>
          </div>
        ))}

        <details className="add-feed">
          <summary><Icon name="plus" size={16} />Add a Torznab feed (advanced)</summary>
          <p className="muted small">Connect an indexer you run yourself, such as Prowlarr or Jackett, using its Torznab URL and API key. Results still go through every safety check above, and only well-seeded releases are used.{engineKind === 'browser' ? ' In the browser your indexer must allow cross-origin requests; the desktop app has no such limit.' : ''}</p>
          <div className="form-grid">
            <input placeholder="Name" value={feed.name} onChange={(e) => setFeed({ ...feed, name: e.target.value })} />
            <input placeholder="Torznab URL, e.g. http://localhost:9696/1/api" value={feed.url} onChange={(e) => setFeed({ ...feed, url: e.target.value })} />
            <input type="password" placeholder="API key" value={feed.apiKey} onChange={(e) => setFeed({ ...feed, apiKey: e.target.value })} autoComplete="off" />
            <label className="inline">Minimum seeders
              <input type="number" min={1} value={feed.minSeeders} onChange={(e) => setFeed({ ...feed, minSeeders: Math.max(1, Number(e.target.value)) })} />
            </label>
          </div>
          {feedError && <p className="warn-text small">{feedError}</p>}
          <label className="check">
            <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} />
            <span>I'll only download content I have the right to. Vidora doesn't vet feeds I add.</span>
          </label>
          <button className="btn primary small" disabled={!!feedError || !feed.name || !feed.url || !ack} onClick={addFeed}>Add feed</button>
        </details>
      </section>
    </div>
  );
}
