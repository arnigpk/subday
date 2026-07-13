// Store / deep-link configuration for the "no app installed" bridge.

export const SITE_HOST = 'web.subday.app';
export const ANDROID_PACKAGE = 'app.subday.vhod';

// Numeric App Store ID (apps.apple.com/app/id6787442372).
export const APP_STORE_ID = '6787442372';

export const PLAY_STORE_URL = `https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE}`;
export const APP_STORE_URL = APP_STORE_ID ? `https://apps.apple.com/app/id${APP_STORE_ID}` : '';

/**
 * Android: an intent:// URL opens the app if installed, otherwise falls back
 * to the Play Store — all in one navigation, no timers needed.
 */
export function buildAndroidIntentUrl(path: string): string {
  const clean = path.startsWith('/') ? path : `/${path}`;
  const fallback = encodeURIComponent(PLAY_STORE_URL);
  return `intent://${SITE_HOST}${clean}#Intent;scheme=https;package=${ANDROID_PACKAGE};S.browser_fallback_url=${fallback};end`;
}

/**
 * iOS: custom scheme handled by App.tsx (`subday://open?path=...`). If the app
 * isn't installed nothing happens, so the caller sets a timeout to the store.
 */
export function buildIosSchemeUrl(path: string): string {
  const clean = path.startsWith('/') ? path : `/${path}`;
  return `subday://open?path=${encodeURIComponent(clean)}`;
}
