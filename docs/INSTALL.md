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

**Web app address:** https://davidrowell11.github.io/vidora/
**Downloads:** https://github.com/davidrowell11/vidora/releases/latest

After installing, open **Settings** and paste a free TMDB key (https://www.themoviedb.org/settings/api) to turn on search, artwork and episode tracking.

---

## In any browser
Works in Chrome, Edge, Samsung Internet, Safari and Firefox, on any device.
1. Open **https://davidrowell11.github.io/vidora/**.
2. That's it: Vidora runs in the tab. Bookmark it, or install it (below) so it gets its own icon.
3. To install it on a computer, use Chrome or Edge and click the **install icon** (a screen with a down arrow) at the right of the address bar, then **Install**. On a Mac in Safari: **File → Add to Dock**.

Downloads made in the browser are kept inside the browser's storage for this site. Clearing the site's data deletes them.

## Android phone or tablet (e.g. Samsung Galaxy)

### Option A: install from the browser (quickest)
1. Open **https://davidrowell11.github.io/vidora/** in **Chrome** or **Samsung Internet**.
2. Chrome: tap **⋮** (top right) → **Install app** (or **Add to Home screen** → **Install**).
   Samsung Internet: tap **☰** (bottom right) → **Add page to** → **Home screen**.
3. Open **Vidora** from your home screen. It runs full screen and keeps downloads on the phone.

### Option B: install the Android app (APK)
1. On the phone, open **https://github.com/davidrowell11/vidora/releases/latest** and tap **Vidora-android.apk**.
2. When asked, allow your browser to **install unknown apps** (Settings → Apps → *your browser* → Install unknown apps → Allow). This is needed for any app that isn't from the Play Store.
3. Open the downloaded file and tap **Install**. If Play Protect asks, tap **Install anyway**: the app isn't on the Play Store, so Google hasn't scanned it.
4. Open **Vidora**. Allow notifications if you want "ready to watch" alerts.

**Tips for phones:** Settings → Quality is preset to 720p with a 2 GB limit so downloads fit comfortably. Download over Wi-Fi. Turn on **Delete after watching** to keep storage free.

## iPhone or iPad
1. Open **https://davidrowell11.github.io/vidora/** in **Safari**.
2. Tap **Share** (□↑) → **Add to Home Screen** → **Add**.
3. Open Vidora from the home screen. (Apple doesn't allow apps like this outside the App Store, so there's no separate iPhone download.)

## Windows
**Without installing anything:** open the web app in Chrome or Edge and click the install icon in the address bar.

**Full app (virus scan + VPN kill switch):**
1. Download **Vidora Setup x.y.z.exe** from the releases page.
2. Run it. Windows may show **"Windows protected your PC"** because the app isn't code-signed yet: click **More info** → **Run anyway**.
3. Click through the installer. Vidora opens when it finishes, and is in the Start menu after that.
4. Microsoft Defender (built in) scans every download automatically.

## Mac
**Without installing anything:** open the web app in Chrome (install icon in the address bar) or Safari (**File → Add to Dock**).

**Full app (virus scan + VPN kill switch):**
1. Download **Vidora-x.y.z.dmg** from the releases page, open it, and drag **Vidora** into **Applications**.
2. The first time, **right-click** (or Control-click) the app → **Open** → **Open**, because it isn't notarized by Apple yet. Or: System Settings → Privacy & Security → **Open Anyway**.
3. After that, open Vidora from Launchpad or Applications like any other app.
4. For virus scanning, install ClamAV once: `brew install clamav && freshclam` (needs Homebrew from https://brew.sh).

## Chromebook
- **Easiest:** open **https://davidrowell11.github.io/vidora/** in Chrome → click the **install icon** in the address bar (or ⋮ → **Cast, save and share** → **Install page as app**).
- **Full desktop app (virus scan + VPN kill switch):** turn on Linux (Settings → About ChromeOS → Developers → Linux development environment), download the **.deb** from the releases page, double-click it, and choose **Install**. Then run `sudo apt install clamav` in the Linux terminal for virus scanning. Vidora appears in your launcher.
- Some school or work Chromebooks block Linux and unknown apps; use the browser version there.

## Linux
Download the **.deb** (Ubuntu, Debian, Mint) and open it, or the **.AppImage** (any distro): `chmod +x Vidora-*.AppImage && ./Vidora-*.AppImage`. Install ClamAV for virus scanning: `sudo apt install clamav`.

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
Do these once, in order, on github.com. Nothing here needs a developer.
1. **Merge the open pull requests** (Pull requests tab → open each → **Merge pull request**). Until then the main branch doesn't contain the app.
2. **Turn on the web app:** **Settings → Pages**, set **Source** to **GitHub Actions**. Then **Actions → Web app → Run workflow** (or just push to `main`). After a minute or two the app is live at https://davidrowell11.github.io/vidora/, and every later change to `main` updates it.
3. **Make the downloads:** **Actions → Release apps → Run workflow**, enter a version like `0.2.0`, and press **Run workflow**. When it finishes, the Windows, Mac, Linux and Android files appear on the [releases page](https://github.com/davidrowell11/vidora/releases/latest).

## Running it from source (developers)
Needs [Node.js 22 or newer](https://nodejs.org/) and Git.
```bash
git clone https://github.com/davidrowell11/vidora.git
cd vidora
npm install
npm run dev        # web app at http://localhost:5173
npm run desktop    # desktop app
```
