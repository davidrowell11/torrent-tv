import '@fontsource-variable/inter';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './ui/App';
import './ui/styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Installable on Chromebooks and desktops as an app from the browser.
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost') && !('Capacitor' in window)) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
