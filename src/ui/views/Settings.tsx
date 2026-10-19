import { useState } from 'react';
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
  const { state, updateSettings, toast, vpn, scanner, engineKind } = useStore();
  const s = state.settings;
  const [key, setKey] = useState(s.tmdbKey);
  const [testing, setTesting] = useState(false);
  const [feed, setFeed] = useState({ name: '', url: '', apiKey: '', minSeeders: 10 });
  const [ack, setAck] = useState(false);
  const feedError = feed.url ? validateTorznabUrl(feed.url) : undefined;

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
        <p className="muted">Torrent TV uses The Movie Database for posters, descriptions and episode schedules. Get a free key at <a href="https://www.themoviedb.org/settings/api" target="_blank" rel="noreferrer">themoviedb.org</a>, then paste it here.</p>
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
            <span>I'll only download content I have the right to. Torrent TV doesn't vet feeds I add.</span>
          </label>
          <button className="btn primary small" disabled={!!feedError || !feed.name || !feed.url || !ack} onClick={addFeed}>Add feed</button>
        </details>
      </section>
    </div>
  );
}
