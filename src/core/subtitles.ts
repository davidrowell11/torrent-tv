/** Convert SubRip (.srt) to WebVTT, which is what the video element understands. */
export function srtToVtt(srt: string): string {
  const body = srt
    .replace(/^﻿/, '')
    .replace(/\r\n?/g, '\n')
    // 00:01:02,345 --> 00:01:04,000  becomes  00:01:02.345 --> 00:01:04.000
    .replace(/(\d{1,2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2')
    // Strip anything that looks like markup other than the basic styling tags VTT allows.
    .replace(/<(?!\/?(b|i|u)>)[^>]*>/gi, '')
    .trim();
  return `WEBVTT\n\n${body}\n`;
}

/** Guess a subtitle's language from names like "Film.en.srt" or "Film.English.srt". */
export function subtitleLang(fileName: string): { lang: string; label: string } {
  const parts = fileName.toLowerCase().split('.');
  const tag = parts.length > 2 ? parts[parts.length - 2] : '';
  const known: Record<string, string> = {
    en: 'English', eng: 'English', english: 'English', es: 'Spanish', spa: 'Spanish', spanish: 'Spanish',
    fr: 'French', fre: 'French', french: 'French', de: 'German', ger: 'German', german: 'German',
    it: 'Italian', ita: 'Italian', pt: 'Portuguese', por: 'Portuguese', nl: 'Dutch', ko: 'Korean', kor: 'Korean',
    ja: 'Japanese', jpn: 'Japanese', zh: 'Chinese', chi: 'Chinese', ru: 'Russian', ar: 'Arabic',
  };
  const label = known[tag];
  return label ? { lang: tag.slice(0, 2), label } : { lang: 'en', label: 'Subtitles' };
}

/** Pick the track to turn on by default: the viewer's language, else English, else the first. */
export function defaultSubtitleIndex(tracks: { lang: string }[], userLang = 'en'): number {
  const want = userLang.slice(0, 2).toLowerCase();
  const i = tracks.findIndex((t) => t.lang === want);
  if (i >= 0) return i;
  const en = tracks.findIndex((t) => t.lang === 'en');
  return en >= 0 ? en : tracks.length ? 0 : -1;
}
