import { useState } from 'react';
import type { DownloadInfo } from '../../core/engine';
import { Icon } from '../components/Icon';
import { useStore } from '../store';

const fmtBytes = (b: number) => (b > 1e9 ? `${(b / 1e9).toFixed(2)} GB` : b > 1e6 ? `${(b / 1e6).toFixed(0)} MB` : `${Math.max(0, b / 1e3).toFixed(0)} KB`);

const phaseText: Record<DownloadInfo['phase'], string> = {
  downloading: 'Downloading', checking: 'Safety check', ready: 'Ready', 'awaiting-scan': 'Needs virus scan', blocked: 'Blocked',
};

export function Downloads() {
  const { downloads, engine, engineKind } = useStore();
  const [player, setPlayer] = useState<{ url: string; title: string } | null>(null);

  const play = async (d: DownloadInfo) => {
    const url = await engine.open(d.id);
    if (typeof url === 'string') setPlayer({ url, title: d.label });
  };

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Downloads</h1>
          <p className="muted">Every file is held in quarantine, checked and {engineKind === 'desktop' ? 'virus-scanned' : 'verified'} before it's released.</p>
        </div>
      </header>
      {downloads.length === 0 && (
        <div className="empty small">
          <div className="empty-art"><Icon name="download" size={40} /></div>
          <p className="muted">Nothing downloading right now.</p>
        </div>
      )}
      <div className="dl-list">
        {[...downloads].reverse().map((d) => {
          const tone = d.phase === 'blocked' || d.error ? 'bad' : d.phase === 'ready' ? 'good' : d.phase === 'awaiting-scan' ? 'warn' : '';
          return (
            <div key={d.id} className={`dl ${tone}`}>
              <div className="dl-icon"><Icon name={d.phase === 'ready' ? 'shieldCheck' : d.phase === 'blocked' ? 'alert' : d.phase === 'checking' ? 'shield' : 'download'} /></div>
              <div className="dl-main">
                <div className="dl-top">
                  <strong>{d.label}</strong>
                  <span className={`phase phase-${d.error ? 'blocked' : d.phase}`}>{d.error ? 'Stopped' : phaseText[d.phase]}</span>
                </div>
                {d.phase === 'downloading' && !d.error && (
                  <>
                    <div className="bar"><i style={{ width: `${(d.progress * 100).toFixed(1)}%` }} /></div>
                    <div className="dl-stats muted small">
                      <span>{(d.progress * 100).toFixed(0)}%</span>
                      {d.sizeBytes > 0 && <span>{fmtBytes(d.sizeBytes * d.progress)} of {fmtBytes(d.sizeBytes)}</span>}
                      <span>{fmtBytes(d.downloadSpeed)}/s</span>
                      <span>{d.numPeers} peers</span>
                      {d.paused && <span className="warn-text">Paused</span>}
                    </div>
                  </>
                )}
                {d.phase === 'checking' && <div className="bar indeterminate"><i /></div>}
                {(d.blockedReason || d.error || d.scanNote) && (
                  <p className="small dl-note">{d.blockedReason ?? d.error ?? d.scanNote}</p>
                )}
                {d.skippedFiles > 0 && <p className="small muted">Skipped {d.skippedFiles} non-video file{d.skippedFiles > 1 ? 's' : ''} in this torrent.</p>}
              </div>
              <div className="dl-actions">
                {d.phase === 'downloading' && !d.error && (
                  <button className="icon-btn" onClick={() => (d.paused ? engine.resume(d.id) : engine.pause(d.id))} aria-label={d.paused ? 'Resume' : 'Pause'}>
                    <Icon name={d.paused ? 'play' : 'pause'} size={18} />
                  </button>
                )}
                {d.phase === 'awaiting-scan' && <button className="btn small ghost" onClick={() => engine.rescan(d.id)}>Scan again</button>}
                {d.phase === 'ready' && (
                  engineKind === 'desktop'
                    ? <button className="btn small primary" onClick={() => engine.open(d.id)}><Icon name="folder" size={16} />Show</button>
                    : <button className="btn small primary" onClick={() => play(d)}><Icon name="play" size={16} />Play</button>
                )}
                <button className="icon-btn" onClick={() => engine.remove(d.id)} aria-label="Remove"><Icon name="trash" size={18} /></button>
              </div>
            </div>
          );
        })}
      </div>
      {player && (
        <div className="modal-backdrop" onClick={() => setPlayer(null)}>
          <div className="player" onClick={(e) => e.stopPropagation()}>
            <div className="player-head">
              <strong>{player.title}</strong>
              <div className="actions">
                <a className="btn small ghost" href={player.url} download={`${player.title}.mp4`}><Icon name="download" size={16} />Save</a>
                <button className="icon-btn" onClick={() => setPlayer(null)} aria-label="Close"><Icon name="close" /></button>
              </div>
            </div>
            <video src={player.url} controls autoPlay />
          </div>
        </div>
      )}
    </div>
  );
}
