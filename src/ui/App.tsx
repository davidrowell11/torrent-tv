import { useState } from 'react';
import type { TitleInfo } from '../core/types';
import { DetailModal } from './components/DetailModal';
import { Icon, type IconName } from './components/Icon';
import { Toasts } from './components/Toasts';
import { StoreProvider, useStore } from './store';
import { Discover } from './views/Discover';
import { Downloads } from './views/Downloads';
import { Library } from './views/Library';
import { Settings } from './views/Settings';

type View = 'discover' | 'library' | 'downloads' | 'settings';
const NAV: { id: View; label: string; icon: IconName }[] = [
  { id: 'discover', label: 'Discover', icon: 'discover' },
  { id: 'library', label: 'Library', icon: 'library' },
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
  const { downloads } = useStore();
  const [view, setView] = useState<View>('discover');
  const [detail, setDetail] = useState<TitleInfo | null>(null);
  const active = downloads.filter((d) => d.phase === 'downloading' || d.phase === 'checking').length;

  return (
    <div className="app">
      <nav className="sidebar" aria-label="Main">
        <div className="brand">
          <span className="logo"><Icon name="play" size={16} /></span>
          <span>Torrent<b>TV</b></span>
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
        {view === 'downloads' && <Downloads />}
        {view === 'settings' && <Settings />}
      </main>
      {detail && <DetailModal key={`${detail.kind}${detail.tmdbId}${detail.iaId}`} info={detail} onClose={() => setDetail(null)} />}
      <Toasts />
    </div>
  );
}

export function App() {
  return (
    <StoreProvider>
      <Shell />
    </StoreProvider>
  );
}
