import { registerPlugin, Capacitor } from '@capacitor/core';

interface ScreenGuardPlugin {
  enable(): Promise<void>;
  disable(): Promise<void>;
}

const ScreenGuard = registerPlugin<ScreenGuardPlugin>('ScreenGuard');

/**
 * Точечная блокировка скриншота/записи экрана.
 * Android — нативный FLAG_SECURE (реально запрещает скриншот и запись).
 * iOS — системно ЗАПРЕТИТЬ скриншот нельзя (ограничение Apple), поэтому no-op.
 * Веб — no-op. Никогда не бросает (в старом бандле плагина может не быть).
 */
export function setScreenGuard(on: boolean): void {
  if (Capacitor.getPlatform() !== 'android') return;
  (on ? ScreenGuard.enable() : ScreenGuard.disable()).catch(() => { /* плагин отсутствует — не критично */ });
}
