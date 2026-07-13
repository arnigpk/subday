import { Capacitor } from '@capacitor/core';

/**
 * Reliably open an external URL / app deep link on every platform.
 *
 * On native we use AppLauncher → UIApplication.open on iOS, which (unlike
 * window.open('_system') inside a WKWebView) honors **universal links** such as
 * https://qr.kaspi.kz/... and hands off to the installed app; on Android it
 * resolves App Links / intents. Falls back to window.open if the plugin fails.
 * On web it's a normal new-tab open.
 */
export async function openExternal(url: string): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    try {
      const { AppLauncher } = await import('@capacitor/app-launcher');
      await AppLauncher.openUrl({ url });
      return;
    } catch {
      window.open(url, '_system');
    }
    return;
  }
  window.open(url, '_blank');
}
