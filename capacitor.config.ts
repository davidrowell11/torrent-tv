import type { CapacitorConfig } from '@capacitor/cli';

// Android app: the same web app, packaged with Capacitor.
const config: CapacitorConfig = {
  appId: 'app.torrenttv.mobile',
  appName: 'Torrent TV',
  webDir: 'dist',
  backgroundColor: '#0b0d12',
  android: {
    // No http, no mixed content, no remote debugging in release builds.
    allowMixedContent: false,
    webContentsDebuggingEnabled: false,
  },
  plugins: {
    LocalNotifications: { iconColor: '#8b5cf6' },
  },
};

export default config;
