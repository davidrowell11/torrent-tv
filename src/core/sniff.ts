/**
 * Content verification: does the file's actual content match its extension?
 * A ".mp4" whose bytes start with "MZ" is a Windows program, not a video.
 * Checked on the first bytes of every finished file, before it leaves quarantine.
 */

const startsWith = (b: Uint8Array, sig: number[], at = 0) => sig.every((v, i) => b[at + i] === v);
const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));

/** Signatures of things that must never be passed off as media. */
const EXECUTABLE_SIGNATURES: [string, number[]][] = [
  ['Windows program', ascii('MZ')],
  ['Linux program', [0x7f, ...ascii('ELF')]],
  ['Mac program', [0xcf, 0xfa, 0xed, 0xfe]],
  ['Mac program', [0xfe, 0xed, 0xfa, 0xcf]],
  ['Mac program', [0xca, 0xfe, 0xba, 0xbe]],
  ['Archive', ascii('PK\x03\x04')],
  ['Archive', ascii('Rar!')],
  ['Archive', [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c]],
  ['Script', ascii('#!')],
  ['PDF', ascii('%PDF')],
];

function matchesContainer(ext: string, b: Uint8Array): boolean {
  switch (ext) {
    case 'mp4': case 'm4v': case 'mov':
      return startsWith(b, ascii('ftyp'), 4) || startsWith(b, ascii('moov'), 4) || startsWith(b, ascii('wide'), 4) || startsWith(b, ascii('mdat'), 4);
    case 'mkv': case 'webm':
      return startsWith(b, [0x1a, 0x45, 0xdf, 0xa3]);
    case 'avi':
      return startsWith(b, ascii('RIFF')) && startsWith(b, ascii('AVI '), 8);
    case 'ogv':
      return startsWith(b, ascii('OggS'));
    case 'mpg': case 'mpeg':
      return startsWith(b, [0x00, 0x00, 0x01, 0xba]) || startsWith(b, [0x00, 0x00, 0x01, 0xb3]) || b[0] === 0x47;
    case 'srt': case 'vtt': case 'ass': case 'ssa': case 'sub':
      return isPlainText(b);
    default:
      return false;
  }
}

function isPlainText(b: Uint8Array): boolean {
  if (b.includes(0)) return false;
  const head = new TextDecoder('utf-8', { fatal: false }).decode(b.slice(0, 512)).toLowerCase();
  return !/<script|<html|<\?php|javascript:|powershell|vbscript/.test(head);
}

export interface SniffResult {
  ok: boolean;
  reason?: string;
}

/** `head` should be at least the first 64 bytes of the file. */
export function verifyContent(fileName: string, head: Uint8Array): SniffResult {
  const ext = fileName.toLowerCase().split('.').pop() ?? '';
  for (const [kind, sig] of EXECUTABLE_SIGNATURES) {
    if (startsWith(head, sig)) return { ok: false, reason: `${kind} disguised as .${ext}` };
  }
  if (!matchesContainer(ext, head)) return { ok: false, reason: `Content is not a real .${ext} file` };
  return { ok: true };
}
