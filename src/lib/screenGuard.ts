import { registerPlugin, Capacitor } from '@capacitor/core';

interface ScreenGuardPlugin {
  enable(): Promise<void>;
  disable(): Promise<void>;
}

const ScreenGuard = registerPlugin<ScreenGuardPlugin>('ScreenGuard');

/**
 * Точечная блокировка скриншота/записи экрана.
 * Android — нативный FLAG_SECURE (реально запрещает скриншот и запись).
 * iOS — приём с secureTextEntry-слоем: скриншот/запись выходят ЧЁРНЫМИ (как в банках).
 *        Провал (иная iOS) «мягкий» — защита не сработает, но приложение не падает.
 * Веб — no-op. Никогда не бросает (в старом бандле плагина может не быть).
 */
export function setScreenGuard(on: boolean): void {
  if (Capacitor.getPlatform() === 'web') return; // только натив (android/ios)
  (on ? ScreenGuard.enable() : ScreenGuard.disable()).catch(() => { /* плагин отсутствует — не критично */ });
}
