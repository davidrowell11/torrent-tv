import { useEffect, useRef, useState } from 'react';
import type { PlayableMedia } from '../../core/engine';
import { defaultSubtitleIndex } from '../../core/subtitles';
import type { PlaybackPosition } from '../../core/types';
import { Icon } from './Icon';

const clock = (s: number) => {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60);
  return `${h ? `${h}:` : ''}${h ? String(m).padStart(2, '0') : m}:${String(sec).padStart(2, '0')}`;
};

/**
 * Full-screen player. Resumes where you stopped, turns on subtitles in your
 * language when the download has them, and reports progress so the episode
 * is marked watched near the end.
 */
export function Player({ title, subtitle, media, resumeAt, onProgress, onClose }: {
  title: string;
  subtitle?: string;
  media: PlayableMedia;
  resumeAt?: PlaybackPosition;
  onProgress(seconds: number, duration: number): void;
  onClose(): void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [resumed, setResumed] = useState<number | null>(null);
  const [error, setError] = useState<string>();
  const subIndex = defaultSubtitleIndex(media.subtitles, navigator.language);

  useEffect(() => () => media.release(), [media]);

  // Resume, unless they'd basically finished it last time.
  const onLoaded = () => {
    const v = video.current!;
    if (resumeAt && resumeAt.seconds > 30 && resumeAt.seconds < v.duration * 0.95) {
      v.currentTime = resumeAt.seconds;
      setResumed(resumeAt.seconds);
      setTimeout(() => setResumed(null), 6000);
    }
    // Show the default subtitle track; tracks start hidden.
    [...v.textTracks].forEach((t, i) => (t.mode = i === subIndex ? 'showing' : 'disabled'));
    v.play().catch(() => {});
  };

  // Save position every few seconds and when leaving.
  useEffect(() => {
    const save = () => {
      const v = video.current;
      if (v && v.duration) onProgress(v.currentTime, v.duration);
    };
    const id = setInterval(save, 5000);
    const onKey = (e: KeyboardEvent) => {
      const v = video.current;
      if (!v) return;
      if (e.key === 'Escape') onClose();
      else if (e.key === ' ' || e.key === 'k') { e.preventDefault(); v.paused ? v.play() : v.pause(); }
      else if (e.key === 'ArrowRight') v.currentTime += 10;
      else if (e.key === 'ArrowLeft') v.currentTime -= 10;
      else if (e.key === 'f') v.requestFullscreen?.();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      save();
      clearInterval(id);
      window.removeEventListener('keydown', onKey);
    };
  }, [onProgress, onClose]);

  return (
    <div className="player-screen" role="dialog" aria-label={`Playing ${title}`}>
      <div className="player-top">
        <button className="icon-btn" onClick={onClose} aria-label="Close player"><Icon name="close" /></button>
        <div className="player-titles">
          <strong>{title}</strong>
          {subtitle && <span>{subtitle}</span>}
        </div>
      </div>
      <video
        ref={video}
        src={media.videoUrl}
        controls
        playsInline
        onLoadedMetadata={onLoaded}
        onPause={() => video.current && onProgress(video.current.currentTime, video.current.duration)}
        onEnded={() => video.current && onProgress(video.current.duration, video.current.duration)}
        onError={() => setError("This video's format isn't supported here. Try the desktop app, or a different release (MP4 plays everywhere).")}
      >
        {media.subtitles.map((s, i) => <track key={s.url} kind="subtitles" src={s.url} srcLang={s.lang} label={s.label} default={i === subIndex} />)}
      </video>
      {resumed !== null && (
        <div className="resume-chip">
          Resumed at {clock(resumed)}
          <button className="link" onClick={() => { if (video.current) video.current.currentTime = 0; setResumed(null); }}>Start over</button>
        </div>
      )}
      {error && <div className="player-error"><Icon name="alert" />{error}</div>}
    </div>
  );
}
