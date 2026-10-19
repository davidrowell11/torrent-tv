import { useState } from 'react';
import type { TitleInfo } from '../core/types';
import { ConfirmProvider } from './components/Confirm';
import { DetailModal } from './components/DetailModal';
import { Player } from './components/Player';
import { Icon, type IconName } from './components/Icon';
import { Toasts } from './components/Toasts';
import { StoreProvider, useStore } from './store';
import { Calendar } from './views/Calendar';
import { Discover } from './views/Discover';
import { Downloads } from './views/Downloads';
import { Library } from './views/Library';
import { Settings } from './views/Settings';

type View = 'discover' | 'library' | 'calendar' | 'downloads' | 'settings';
const NAV: { id: View; label: string; icon: IconName }[] = [
  { id: 'discover', label: 'Discover', icon: 'discover' },
  { id: 'library', label: 'Library', icon: 'library' },
  { id: 'calendar', label: 'Calendar', icon: 'calendar' },
  { id: 'downloads', label: 'Downloads', icon: 'download' },
  { id: 'settings', label: 'Settings', icon: 'settings' },
];

function SafetyBadge() {
  const { vpn, scanner, engineKind, state } = useStore();
  const scanOk = engineKind === 'desktop' ? !!scanner || !state.settings.requireVirusScan : true;
  const vpnOk = !vpn.supported || vpn.connected || !state.settings.requireVpn;
  const allOk = scanOk && vpnOk;
  return (
    <div className={`safety ${allOk ? 'ok' : 'warn'}`}>
      <Icon name={allOk ? 'shieldCheck' : 'alert'} size={18} />
      <div>
        <strong>{allOk ? 'Protected' : 'Attention'}</strong>
        <span>
          {vpn.supported ? (vpn.connected ? 'VPN on' : 'No VPN') : 'Browser mode'}
          {' · '}
          {engineKind === 'desktop' ? (scanner ? 'Scanner ready' : 'No scanner') : 'Files verified'}
        </span>
      </div>
    </div>
  );
}

function Shell() {
  const { downloads, nowPlaying, closePlayer, savePosition } = useStore();
  const [view, setView] = useState<View>('discover');
  const [detail, setDetail] = useState<TitleInfo | null>(null);
  const active = downloads.filter((d) => d.phase === 'downloading' || d.phase === 'checking').length;

  return (
    <div className="app">
      <nav className="sidebar" aria-label="Main">
        <div className="brand">
          <span className="logo"><Icon name="play" size={16} /></span>
          <span>Vid<b>ora</b></span>
        </div>
        {NAV.map((n) => (
          <button key={n.id} className={`nav-item ${view === n.id ? 'active' : ''}`} onClick={() => setView(n.id)} aria-current={view === n.id ? 'page' : undefined}>
            <Icon name={n.icon} />
            <span>{n.label}</span>
            {n.id === 'downloads' && active > 0 && <em className="count">{active}</em>}
          </button>
        ))}
        <div className="sidebar-foot"><SafetyBadge /></div>
      </nav>
      <main className="content">
        {view === 'discover' && <Discover open={setDetail} goSettings={() => setView('settings')} />}
        {view === 'library' && <Library open={setDetail} goDiscover={() => setView('discover')} />}
        {view === 'calendar' && <Calendar open={setDetail} goDiscover={() => setView('discover')} />}
        {view === 'downloads' && <Downloads />}
        {view === 'settings' && <Settings />}
      </main>
      {detail && <DetailModal key={`${detail.kind}${detail.tmdbId}${detail.iaId}`} info={detail} onClose={() => setDetail(null)} />}
      {nowPlaying && (
        <Player
          key={nowPlaying.media.videoUrl}
          title={nowPlaying.title}
          subtitle={nowPlaying.subtitle}
          media={nowPlaying.media}
          resumeAt={nowPlaying.resumeAt}
          onProgress={(s, d) => savePosition(nowPlaying.key, nowPlaying.ep, s, d)}
          onClose={closePlayer}
        />
      )}
      <Toasts />
    </div>
  );
}

export function App() {
  return (
    <StoreProvider>
      <ConfirmProvider>
        <Shell />
      </ConfirmProvider>
    </StoreProvider>
  );
}
