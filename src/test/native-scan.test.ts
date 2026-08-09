import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Состояние платформы задаём из тестов — так проверяем и айфон без плагина,
// и обычный веб, и нормально собранное приложение.
const platform = { native: true, available: true, name: 'ios' };

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => platform.native,
    isPluginAvailable: () => platform.available,
    getPlatform: () => platform.name,
  },
}));

// Любое обращение к плагину здесь считается нарушением: на платформе, где он не
// собран, оно возвращает отказ «not implemented», и тот попадает в лог ошибок.
const pluginTouched = vi.fn();
vi.mock('@capacitor-mlkit/barcode-scanning', () => ({
  get BarcodeScanner() {
    pluginTouched();
    return {
      isSupported: () => Promise.reject(new Error('"BarcodeScanner" plugin is not implemented on ios')),
      isGoogleBarcodeScannerModuleAvailable: () => Promise.reject(new Error('not implemented')),
      installGoogleBarcodeScannerModule: () => Promise.reject(new Error('not implemented')),
      checkPermissions: () => Promise.reject(new Error('not implemented')),
      scan: () => Promise.reject(new Error('not implemented')),
    };
  },
}));

import { isNativeScanReady, warmUpNativeScanner, nativeScanQR } from '@/lib/nativeScan';

describe('нативный сканер — плагин не зарегистрирован на платформе', () => {
  let rejections: unknown[];
  const catchRejection = (e: PromiseRejectionEvent) => { rejections.push(e.reason); };

  beforeEach(() => {
    rejections = [];
    pluginTouched.mockClear();
    localStorage.clear();
    platform.native = true;
    platform.available = false; // плагин в сборку не попал — как на iOS без cap sync
    platform.name = 'ios';
    window.addEventListener('unhandledrejection', catchRejection);
  });

  afterEach(() => {
    window.removeEventListener('unhandledrejection', catchRejection);
  });

  it('готовность = нет, и плагин не тронут ни разу', () => {
    expect(isNativeScanReady()).toBe(false);
    expect(pluginTouched).not.toHaveBeenCalled();
  });

  it('фоновый прогрев молчит и не трогает плагин', async () => {
    await warmUpNativeScanner();
    expect(pluginTouched).not.toHaveBeenCalled();
    expect(isNativeScanReady()).toBe(false);
  });

  it('сканирование сразу отдаёт «недоступно» — экран уйдёт на камеру', async () => {
    const res = await nativeScanQR();
    expect(res.status).toBe('unavailable');
    expect(pluginTouched).not.toHaveBeenCalled();
  });

  it('не оставляет непойманных отклонений промисов (их пишет лог ошибок)', async () => {
    await warmUpNativeScanner();
    await nativeScanQR();
    await new Promise(r => setTimeout(r, 50));
    expect(rejections).toEqual([]);
  });

  it('даже с ранее выставленным кешем готовности плагин не дёргается', async () => {
    localStorage.setItem('native_scan_ready', '1');
    expect(isNativeScanReady()).toBe(false); // регистрация важнее кеша
    const res = await nativeScanQR();
    expect(res.status).toBe('unavailable');
    expect(pluginTouched).not.toHaveBeenCalled();
  });
});

describe('нативный сканер — обычный веб', () => {
  beforeEach(() => {
    localStorage.clear();
    platform.native = false;
    platform.available = false;
    platform.name = 'web';
  });

  it('в вебе нативного сканера нет и плагин не грузится', async () => {
    expect(isNativeScanReady()).toBe(false);
    await warmUpNativeScanner();
    expect((await nativeScanQR()).status).toBe('unavailable');
  });
});
