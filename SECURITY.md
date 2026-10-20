# Security model

Vidora assumes every torrent is hostile until proven otherwise. Each download passes these layers in order:

| Layer | What it does | Where |
|---|---|---|
| Trusted sources | Torrent links must be magnets or HTTPS URLs on the host the source vouches for. Off-host links and redirects are refused. `.torrent` files are size-capped and must be valid bencode. | `src/core/safety.ts`, `src/core/engine/fetchTorrent.ts`, `electron/main.ts` |
| File allowlist | Only video (`mp4 mkv webm m4v mov avi ogv mpg`) and subtitle files are ever selected. Executables, scripts, archives, double extensions (`film.exe.mp4`), right-to-left-override names and path traversal are skipped. A torrent whose largest file is not a video, or is suspiciously small, is rejected outright. Torrents start with every file deselected, so nothing is written before this check. | `src/core/safety.ts` |
| Quarantine | Desktop downloads land in a hidden quarantine folder, never in your library. Leftovers are deleted on startup. | `electron/main.ts` |
| Content check | The first bytes of every file are checked against the real container format. A Windows/Mac/Linux program, archive, script or PDF named `.mp4` is caught and deleted. | `src/core/sniff.ts` |
| Antivirus | Every file is scanned by Microsoft Defender (Windows) or ClamAV (Mac, Linux, Chromebook). Infected or unscannable files are deleted. With "Virus scan every download" on (default) and no scanner installed, files stay in quarantine until one is. | `electron/scan.ts` |
| VPN kill switch | Desktop only, on by default: no torrent starts without a detected VPN, and if the VPN drops all torrents pause and peer connections are closed until it returns. Detection looks for VPN network interfaces; it is awareness, not a guarantee that all traffic is tunnelled. Use your VPN's own kill switch too. | `electron/vpn.ts` |
| No seeding | Torrents are stopped as soon as they finish. | `electron/main.ts` |
| Hardened desktop shell | `contextIsolation`, `sandbox`, no Node in the page, a narrow validated IPC bridge, strict Content-Security-Policy, navigation and new windows blocked, all permission requests denied, external links only to an allowlist. | `electron/main.ts`, `electron/preload.cjs`, `index.html` |

## Updates and keys

- **Signed Android updates:** every Android release is signed with the same private key, held only in the repository's GitHub secrets. Android installs an update only when the signature matches, so nobody else can publish an APK that replaces Vidora.
- **Your API keys** (TMDB, OMDb, Trakt) are stored only on your device and sent only to their own service over HTTPS.
- **Services Vidora contacts:** TMDB and OMDb for info, artwork and ratings; Internet Archive for free films; Trakt if you connect it; and any Torznab feed you add yourself.

## Browser mode limits

Browsers cannot run a virus scanner or see your VPN. In the browser, files are still allowlisted and content-checked before you can play or save them, and only WebRTC peers and HTTPS web seeds are used (no raw BitTorrent connections). Use the desktop app for full protection.

## Reporting a vulnerability

Open a private security advisory on the GitHub repository.
