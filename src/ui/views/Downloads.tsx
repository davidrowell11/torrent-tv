import type { DownloadInfo } from '../../core/engine';
import { keyOf } from '../../core/library';
import type { EpisodeRef } from '../../core/types';
import { useConfirm } from '../components/Confirm';
import { Icon } from '../components/Icon';
import { useStore } from '../store';

export const fmtBytes = (b: number) => (b > 1e9 ? `${(b / 1e9).toFixed(2)} GB` : b > 1e6 ? `${(b / 1e6).toFixed(0)} MB` : `${Math.max(0, b / 1e3).toFixed(0)} KB`);

const phaseText: Record<DownloadInfo['phase'], string> = {
  downloading: 'Downloading', checking: 'Safety check', ready: 'Ready', 'awaiting-scan': 'Needs virus scan', blocked: 'Blocked',
};

export function Downloads() {
  const store = useStore();
  const { downloads, engine, engineKind, storageUsed } = store;
  const confirm = useConfirm();

  /** Which library title (and episode) a download belongs to. */
  const owner = (id: string): { key: string; ep?: EpisodeRef } | undefined => {
    for (const item of store.state.library) {
      if (item.downloadId === id) return { key: keyOf(item.info) };
      const ep = item.episodes?.find((e) => e.downloadId === id);
      if (ep) return { key: keyOf(item.info), ep };
    }
    return undefined;
  };

  const del = async (d: DownloadInfo) => {
    const ok = await confirm(`Delete ${d.label}?`, 'The file is removed from this device. It stays in your library so you can download it again later.', [
      { value: 'yes', label: 'Delete file', tone: 'danger' },
    ]);
    if (!ok) return;
    const o = owner(d.id);
    if (o) await store.deleteDownload(o.key, o.ep);
    else await engine.deleteFiles(d.id);
    store.toast(`Deleted ${d.label}`);
  };

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Downloads</h1>
          <p className="muted">
            {storageUsed > 0 ? `${fmtBytes(storageUsed)} used on this device. ` : ''}
            Every file is checked{engineKind === 'desktop' ? ' and virus-scanned' : ''} before it's released.
          </p>
        </div>
      </header>
      {downloads.length === 0 && (
        <div className="empty small">
          <div className="empty-art"><Icon name="download" size={40} /></div>
          <p className="muted">Nothing here yet. Downloads you start appear here.</p>
        </div>
      )}
      <div className="dl-list">
        {[...downloads].reverse().map((d) => {
          const tone = d.phase === 'blocked' || d.error ? 'bad' : d.phase === 'ready' ? 'good' : d.phase === 'awaiting-scan' ? 'warn' : '';
          const o = owner(d.id);
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
                {(d.blockedReason || d.error || d.scanNote) && <p className="small dl-note">{d.blockedReason ?? d.error ?? d.scanNote}</p>}
                {d.phase === 'ready' && d.sizeBytes > 0 && <p className="small muted">{fmtBytes(d.sizeBytes)}</p>}
                {d.skippedFiles > 0 && <p className="small muted">Skipped {d.skippedFiles} non-video file{d.skippedFiles > 1 ? 's' : ''} in this torrent.</p>}
              </div>
              <div className="dl-actions">
                {d.phase === 'downloading' && !d.error && (
                  <button className="icon-btn" onClick={() => (d.paused ? engine.resume(d.id) : engine.pause(d.id))} aria-label={d.paused ? 'Resume' : 'Pause'}>
                    <Icon name={d.paused ? 'play' : 'pause'} size={18} />
                  </button>
                )}
                {d.phase === 'awaiting-scan' && <button className="btn small ghost" onClick={() => engine.rescan(d.id)}>Scan again</button>}
                {d.phase === 'ready' && o && <button className="btn small primary" onClick={() => store.play(o.key, o.ep)}><Icon name="play" size={16} />Play</button>}
                {d.phase === 'ready' && engine.reveal && (
                  <button className="icon-btn" onClick={() => engine.reveal!(d.id)} aria-label="Show in folder"><Icon name="folder" size={18} /></button>
                )}
                {d.phase === 'ready' ? (
                  <button className="icon-btn" onClick={() => del(d)} aria-label="Delete file"><Icon name="trash" size={18} /></button>
                ) : (
                  <button className="icon-btn" onClick={() => (o ? store.deleteDownload(o.key, o.ep) : engine.deleteFiles(d.id))} aria-label="Cancel download"><Icon name="close" size={18} /></button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
