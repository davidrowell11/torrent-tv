# Installing Vidora

Vidora works two ways on every device:

- **In the browser**: open the web app and use it straight away, or install it to your home screen / app list so it opens like an app.
- **As a downloaded app**: an installer for Windows, Mac, Linux / Chromebook, or an Android APK.

| | Browser / installed web app | Downloaded app |
|---|---|---|
| Discover, follow shows, artwork, calendar, player, watched tracking, Trakt | ✅ | ✅ |
| File check (only real videos are kept) | ✅ | ✅ |
| Virus scan of every download | — | ✅ Windows, Mac, Linux |
| VPN kill switch | — | ✅ Windows, Mac, Linux |
| Files saved where other apps (Plex, VLC, Kodi) can see them | — | ✅ Windows, Mac, Linux |
| Works on phones | ✅ | ✅ Android |

**Web app address:** https://davidrowell11.github.io/torrent-tv/
**Downloads:** https://github.com/davidrowell11/torrent-tv/releases/latest

After installing, open **Settings** and paste a free TMDB key (https://www.themoviedb.org/settings/api) to turn on search, artwork and episode tracking.

---

## Android phone or tablet (e.g. Samsung Galaxy)

### Option A: install from the browser (quickest)
1. Open **https://davidrowell11.github.io/torrent-tv/** in **Chrome** or **Samsung Internet**.
2. Chrome: tap **⋮** (top right) → **Install app** (or **Add to Home screen** → **Install**).
   Samsung Internet: tap **☰** (bottom right) → **Add page to** → **Home screen**.
3. Open **Vidora** from your home screen. It runs full screen and keeps downloads on the phone.

### Option B: install the Android app (APK)
1. On the phone, open **https://github.com/davidrowell11/torrent-tv/releases/latest** and tap **Vidora-android.apk**.
2. When asked, allow your browser to **install unknown apps** (Settings → Apps → *your browser* → Install unknown apps → Allow). This is needed for any app that isn't from the Play Store.
3. Open the downloaded file and tap **Install**. If Play Protect asks, tap **Install anyway**: the app isn't on the Play Store, so Google hasn't scanned it.
4. Open **Vidora**. Allow notifications if you want "ready to watch" alerts.

**Tips for phones:** Settings → Quality is preset to 720p with a 2 GB limit so downloads fit comfortably. Download over Wi-Fi. Turn on **Delete after watching** to keep storage free.

## iPhone or iPad
1. Open **https://davidrowell11.github.io/torrent-tv/** in **Safari**.
2. Tap **Share** (□↑) → **Add to Home Screen** → **Add**.
3. Open Vidora from the home screen. (Apple doesn't allow apps like this outside the App Store, so there's no separate iPhone download.)

## Windows
1. Download **Vidora Setup x.y.z.exe** from the releases page.
2. Run it. Windows may show **"Windows protected your PC"** because the app isn't code-signed yet: click **More info** → **Run anyway**.
3. Microsoft Defender (built in) scans every download automatically.

## Mac
1. Download **Vidora-x.y.z.dmg** from the releases page, open it, and drag **Vidora** into **Applications**.
2. The first time, **right-click** (or Control-click) the app → **Open** → **Open**, because it isn't notarized by Apple yet. Or: System Settings → Privacy & Security → **Open Anyway**.
3. For virus scanning, install ClamAV once: `brew install clamav && freshclam` (needs Homebrew from https://brew.sh).

## Chromebook
- **Easiest:** open **https://davidrowell11.github.io/torrent-tv/** in Chrome → click the **install icon** in the address bar (or ⋮ → **Cast, save and share** → **Install page as app**).
- **Full desktop app (virus scan + VPN kill switch):** turn on Linux (Settings → About ChromeOS → Developers → Linux development environment), download the **.deb** from the releases page, double-click it, and choose **Install**. Then run `sudo apt install clamav` in the Linux terminal for virus scanning. Vidora appears in your launcher.
- Some school or work Chromebooks block Linux and unknown apps; use the browser version there.

## Linux
Download the **.deb** (Ubuntu, Debian, Mint) and open it, or the **.AppImage** (any distro): `chmod +x Torrent*.AppImage && ./Torrent*.AppImage`. Install ClamAV for virus scanning: `sudo apt install clamav`.

---

## Removing downloads
- **One film or episode:** open the title and tap **Delete download** (films) or the bin icon next to an episode. It stays in your library so you can download it again.
- **From the Downloads tab:** bin icon on any finished download.
- **A whole show or film:** open it → **Remove from library** → choose **Remove and delete files** or **Remove, keep files**.
- **Automatically:** Settings → Storage → **Delete after watching**.

## Uninstalling
- Android: long-press the icon → **Uninstall** (or **Remove** for the browser version).
- Windows: Settings → Apps → Vidora → Uninstall. Mac: drag it from Applications to the Bin.
- Downloaded videos from the desktop app are in your **Downloads/Vidora** folder; delete it to remove them.

## For the repository owner: publishing
- **Web app:** one-time, open the repo's **Settings → Pages** and set **Source** to **GitHub Actions**. Every push to `main` then updates the web app.
- **Downloads:** **Actions → Release apps → Run workflow** (enter a version like `0.2.0`). It builds the Windows, Mac, Linux and Android files and publishes them on the releases page.
