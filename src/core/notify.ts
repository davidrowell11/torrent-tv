/**
 * Device notifications ("Show S01E03 is ready to watch").
 * - Android app: native notifications through Capacitor.
 * - Browsers: through the service worker (the only route Android Chrome allows), else the page API.
 */
interface CapacitorGlobal {
  isNativePlatform?(): boolean;
}
const native = () => !!(globalThis as { Capacitor?: CapacitorGlobal }).Capacitor?.isNativePlatform?.();

export function notificationsSupported(): boolean {
  return native() || (typeof window !== 'undefined' && 'Notification' in window);
}

export async function requestNotifications(): Promise<boolean> {
  if (native()) {
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    return (await LocalNotifications.requestPermissions()).display === 'granted';
  }
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  return (await Notification.requestPermission()) === 'granted';
}

let nextId = 1;
export async function notify(title: string, body: string, icon?: string) {
  if (native()) {
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    await LocalNotifications.schedule({ notifications: [{ id: nextId++, title, body }] }).catch(() => {});
    return;
  }
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) return await reg.showNotification(title, { body, icon: icon ?? './icon-192.png', badge: './icon-192.png', tag: `${title}:${body}` });
  } catch {
    // fall through to the page-level API
  }
  try {
    new Notification(title, { body, icon: icon ?? './icon-192.png' });
  } catch {
    // Some platforms only allow service-worker notifications; nothing else to do.
  }
}
