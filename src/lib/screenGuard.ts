import { registerPlugin, Capacitor } from '@capacitor/core';

interface ScreenGuardPlugin {
  enable(): Promise<void>;
  disable(): Promise<void>;
}

const ScreenGuard = registerPlugin<ScreenGuardPlugin>('ScreenGuard');

/**
 * Точечная блокировка скриншота/записи экрана.
 * Android — нативный FLAG_SECURE (реально запрещает скриншот и запись).
 * iOS — НЕ поддерживается: Apple системно не даёт запретить скриншот, а трюк с
 *        secureTextEntry в нашей связке (Capacitor/WKWebView) не срабатывает. Поэтому
 *        на iOS ничего не делаем — экран QR можно заскринить (осознанно принято).
 * Веб — no-op. Никогда не бросает (в старом бандле плагина может не быть).
 */
export function setScreenGuard(on: boolean): void {
  if (Capacitor.getPlatform() !== 'android') return; // только Android
  (on ? ScreenGuard.enable() : ScreenGuard.disable()).catch(() => { /* плагин отсутствует — не критично */ });
}
