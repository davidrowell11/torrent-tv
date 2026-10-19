# Torrent TV

Pick the shows and films you love. Torrent TV downloads them, fetches new episodes automatically as they air, shows posters and details for everything, and checks every file before it reaches you.

Use it in any browser (and install it to your phone's home screen), or download the app for **Android, Windows, Mac, Linux and Chromebook**. **[How to install on each device →](docs/INSTALL.md)**

![Discover](docs/desktop-discover.png)

| Title details | On a phone | Calendar |
|---|---|---|
| ![Details](docs/desktop-detail.png) | ![Phone](docs/mobile-discover.png) | ![Calendar](docs/mobile-calendar.png) |

![Library with Continue watching](docs/desktop-library.png)

<sub>Screenshots use sample artwork.</sub>

## Features

- **Discover**: trending titles, instant search, and a shelf of free public-domain classics you can download right away.
- **Follow shows**: new episodes download on their own (checked every few hours). Or grab a whole series from episode one.
- **You choose what downloads**: nothing is fetched unless you press Download or Get, or follow a show. Unfollow and its episodes stop. Films can be saved to your library without downloading.
- **Artwork and info**: posters, backdrops, ratings, genres and episode lists from [TMDB](https://www.themoviedb.org/), filled in for every title in your library (free classics are matched to TMDB too).
- **Media-player ready (desktop)**: downloads are filed as `Films/Title (Year)/` and `TV/Show/Season 01/Show S01E02.mp4`, with `poster.jpg`, `fanart.jpg` and `.nfo` info files that Plex, Jellyfin and Kodi read.
- **Built-in player**: resumes where you stopped and turns on subtitles in your language automatically. A "Continue watching" row takes you straight back in.
- **Quality settings**: preferred resolution (480p to 4K) and a maximum file size. Phones default to 720p.
- **Calendar**: upcoming episodes for every show you follow.
- **Watched tracking**: episodes are marked watched as you finish them, with optional **Trakt** sync so your history follows you everywhere.
- **Storage cleanup**: delete episodes (and optionally films) automatically after you've watched them. Delete any download yourself at any time.
- **Notifications**: get told when a new episode is ready to watch.
- **Safe by default**: file allowlist, quarantine, content verification, antivirus scan, VPN kill switch. See [SECURITY.md](SECURITY.md).
- **Your data stays local**: library and settings live on your device only.

## Sources

Built in: **Internet Archive**, which hosts thousands of public domain films and classic TV episodes with official, verified torrents.

Advanced: add your own **Torznab** feed (the standard used by Sonarr and Radarr, usually through a self-hosted Prowlarr or Jackett). Torrent TV doesn't ship or recommend any indexers; you choose what to connect and are responsible for downloading only content you have the right to. Results from your feeds pass the same safety checks, plus a minimum-seeders bar.

## Getting started

```bash
npm install
npm run dev          # web app at http://localhost:5173
npm run desktop      # desktop app
npm test             # unit tests
npm run dist         # build desktop installers into release/
npm run android:apk  # build the Android APK (needs Android Studio / SDK)
```

Release builds for every platform are made by the **Release apps** GitHub Action; the web app is published to GitHub Pages on every push to `main`.

Then open **Settings** and paste a free TMDB API key from <https://www.themoviedb.org/settings/api> to turn on search, artwork and episode tracking.

For virus scanning in the desktop app, have Microsoft Defender on (Windows, default) or install ClamAV:
- Mac: `brew install clamav`
- Linux / Chromebook: `sudo apt install clamav`

### Hosting the web version

`npm run build` writes a static site to `dist/`. Serve it over HTTPS from any static host.


## Project layout

```
src/core/            shared logic (no UI)
  safety.ts          file allowlist and trusted-link checks
  sniff.ts           real-content verification
  follow.ts          which episodes to fetch
  library.ts         library state, persistence
  metadata/tmdb.ts   artwork and info
  sources/           Internet Archive, Torznab, source registry
  engine/            torrent engine: in-browser or via the desktop app
src/ui/              React interface
electron/            desktop shell: torrent engine, quarantine, antivirus, VPN kill switch
android/             Android app (Capacitor) wrapping the web app
```
