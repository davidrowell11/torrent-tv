import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Antivirus scanning with whatever trusted scanner the computer already has:
 * Microsoft Defender on Windows, ClamAV on Mac/Linux/Chromebook (Linux).
 * Programs are run directly (no shell) with the file path as a single argument.
 */

export type ScanResult =
  | { status: 'clean'; scanner: string }
  | { status: 'infected'; scanner: string; detail: string }
  | { status: 'unavailable' }
  | { status: 'error'; scanner: string; detail: string };

interface Scanner {
  name: string;
  bin: string;
  args: (file: string) => string[];
  /** Map exit code to a verdict. */
  verdict: (code: number) => 'clean' | 'infected' | 'error';
}

function candidates(): Scanner[] {
  const list: Scanner[] = [];
  if (process.platform === 'win32') {
    const pf = process.env.ProgramFiles ?? 'C:\\Program Files';
    list.push({
      name: 'Microsoft Defender',
      bin: join(pf, 'Windows Defender', 'MpCmdRun.exe'),
      // Remediation stays on: Defender quarantines anything it finds, which is what we want.
      args: (f) => ['-Scan', '-ScanType', '3', '-File', f],
      verdict: (c) => (c === 0 ? 'clean' : c === 2 ? 'infected' : 'error'),
    });
  }
  const clamDirs = process.platform === 'win32'
    ? ['C:\\Program Files\\ClamAV']
    : ['/usr/bin', '/usr/local/bin', '/opt/homebrew/bin', '/opt/local/bin'];
  for (const dir of clamDirs) {
    for (const exe of ['clamdscan', 'clamscan']) {
      list.push({
        name: 'ClamAV',
        bin: join(dir, process.platform === 'win32' ? `${exe}.exe` : exe),
        args: (f) => ['--no-summary', ...(exe === 'clamdscan' ? ['--fdpass'] : []), f],
        verdict: (c) => (c === 0 ? 'clean' : c === 1 ? 'infected' : 'error'),
      });
    }
  }
  return list;
}

export function availableScanner(): string | undefined {
  return candidates().find((s) => existsSync(s.bin))?.name;
}

export function scanFile(file: string): Promise<ScanResult> {
  const usable = candidates().filter((s) => existsSync(s.bin));
  if (usable.length === 0) return Promise.resolve({ status: 'unavailable' });
  const run = (i: number): Promise<ScanResult> => {
    const s = usable[i];
    return new Promise((resolveScan) => {
      execFile(s.bin, s.args(file), { timeout: 15 * 60_000, windowsHide: true }, (err, stdout) => {
        const code = err ? (typeof err.code === 'number' ? err.code : -1) : 0;
        const v = s.verdict(code);
        if (v === 'error' && i + 1 < usable.length) return resolveScan(run(i + 1));
        if (v === 'clean') resolveScan({ status: 'clean', scanner: s.name });
        else if (v === 'infected') resolveScan({ status: 'infected', scanner: s.name, detail: stdout.trim().slice(0, 300) });
        else resolveScan({ status: 'error', scanner: s.name, detail: String(err?.message ?? 'scan failed').slice(0, 300) });
      });
    });
  };
  return run(0);
}
