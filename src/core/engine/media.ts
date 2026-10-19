import { srtToVtt, subtitleLang } from '../subtitles';
import type { PlayableMedia } from './types';

/** Turn a video (Blob or URL) and subtitle texts into something the player can use. */
export function buildMedia(video: Blob | string, subs: { name: string; text: string }[]): PlayableMedia {
  const urls: string[] = [];
  const videoUrl = typeof video === 'string' ? video : URL.createObjectURL(video);
  if (typeof video !== 'string') urls.push(videoUrl);
  const subtitles = subs.map(({ name, text }) => {
    const vtt = /\.vtt$/i.test(name) ? text : srtToVtt(text);
    const url = URL.createObjectURL(new Blob([vtt], { type: 'text/vtt' }));
    urls.push(url);
    return { ...subtitleLang(name), url };
  });
  return { videoUrl, subtitles, release: () => urls.forEach((u) => URL.revokeObjectURL(u)) };
}
