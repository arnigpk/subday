import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Состояние платформы задаём из тестов — так проверяем и айфон, и Android, и
// обычный веб, и приложение, куда плагин не попал при сборке.
const platform = { native: true, name: 'ios', plugins: new Set<string>() };

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => platform.native,
    isPluginAvailable: (name: string) => platform.plugins.has(name),
    getPlatform: () => platform.name,
  },
}));

// Плагин один на обе платформы. Любое обращение к нему там, где он не собран,
// считается нарушением: оно возвращает отказ «not implemented», и тот попадает
// в лог ошибок приложения.
const pluginTouched = vi.fn();
const scanBarcode = vi.fn();
vi.mock('@capacitor/barcode-scanner', () => ({
  get CapacitorBarcodeScanner() {
    pluginTouched();
    return { scanBarcode };
  },
  CapacitorBarcodeScannerTypeHint: { QR_CODE: 0 },
}));

import { isNativeScanReady, warmUpNativeScanner, nativeScanQR } from '@/lib/nativeScan';

const PLUGIN = 'CapacitorBarcodeScanner';
const READY = 'native_scan_ready';

/**
 * Отказ ровно в том виде, в каком его отдаёт нативный слой. Схема кодов общая для
 * обеих платформ: OS-PLUG-BARC- + номер из библиотеки Ionic.
 */
function nativeError(code: string) {
  return Object.assign(new Error('native'), { code });
}
const CANCELLED = 'OS-PLUG-BARC-0006';
const NO_CAMERA = 'OS-PLUG-BARC-0007';
const SCAN_BROKEN = 'OS-PLUG-BARC-0004';

beforeEach(() => {
  pluginTouched.mockClear();
  scanBarcode.mockReset();
  localStorage.clear();
  platform.native = true;
  platform.name = 'ios';
  platform.plugins = new Set();
});

// Главное требование к переходу на единый плагин: Android должен вести себя
// ТОЧНО так же, как проверенный в бою айфон. Поэтому один и тот же набор
// прогоняется на обеих платформах — расхождение сразу упадёт тестом.
describe.each(['ios', 'android'])('нативный сканер — %s, плагин собран', (name) => {
  beforeEach(() => {
    platform.name = name;
    platform.plugins = new Set([PLUGIN]);
  });

  it('прогрев включает сканер, не сделав ни одного вызова в плагин', async () => {
    expect(isNativeScanReady()).toBe(false); // до прогрева не знаем
    await warmUpNativeScanner();
    expect(isNativeScanReady()).toBe(true);
    expect(pluginTouched).not.toHaveBeenCalled();
  });

  it('читает код и просит именно QR', async () => {
    localStorage.setItem(READY, '1');
    scanBarcode.mockResolvedValue({ ScanResult: 'subday://redeem/42', format: 0 });
    expect(await nativeScanQR()).toEqual({ status: 'scanned', value: 'subday://redeem/42' });
    expect(scanBarcode).toHaveBeenCalledWith({ hint: 0 });
  });

  it('закрыли окно → «отмена», сканер остаётся готовым', async () => {
    localStorage.setItem(READY, '1');
    scanBarcode.mockRejectedValue(nativeError(CANCELLED));
    expect((await nativeScanQR()).status).toBe('cancelled');
    expect(localStorage.getItem(READY)).toBe('1');
  });

  it('пустой результат — это тоже закрытое окно, а не сбой', async () => {
    localStorage.setItem(READY, '1');
    scanBarcode.mockResolvedValue({ ScanResult: '', format: 0 });
    expect((await nativeScanQR()).status).toBe('cancelled');
    expect(localStorage.getItem(READY)).toBe('1');
  });

  it('нет доступа к камере → «недоступен», но готовность не снимаем', async () => {
    localStorage.setItem(READY, '1');
    scanBarcode.mockRejectedValue(nativeError(NO_CAMERA));
    expect((await nativeScanQR()).status).toBe('unavailable');
    // Разрешение могут выдать позже — плагин не должен отключаться навсегда.
    expect(localStorage.getItem(READY)).toBe('1');
  });

  it('плагин действительно сломан → «недоступен» и готовность снимается', async () => {
    localStorage.setItem(READY, '1');
    scanBarcode.mockRejectedValue(nativeError(SCAN_BROKEN));
    expect((await nativeScanQR()).status).toBe('unavailable');
    expect(localStorage.getItem(READY)).toBeNull();
  });

  it('прочитан любой код — это успех сканера, содержимое его не касается', async () => {
    // QR чужой кофейни, не-subday код, уже использованный — для сканера это
    // одинаково успешная работа. Разбирается дальше, экраном.
    localStorage.setItem(READY, '1');
    scanBarcode.mockResolvedValue({ ScanResult: 'что-угодно', format: 0 });
    expect(await nativeScanQR()).toEqual({ status: 'scanned', value: 'что-угодно' });
    expect(localStorage.getItem(READY)).toBe('1');
  });
});

describe('нативный сканер — плагин не зарегистрирован на платформе', () => {
  let rejections: unknown[];
  const catchRejection = (e: PromiseRejectionEvent) => { rejections.push(e.reason); };

  beforeEach(() => {
    rejections = [];
    platform.plugins = new Set(); // плагин в сборку не попал
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
    expect((await nativeScanQR()).status).toBe('unavailable');
    expect(pluginTouched).not.toHaveBeenCalled();
  });

  it('не оставляет непойманных отклонений промисов (их пишет лог ошибок)', async () => {
    await warmUpNativeScanner();
    await nativeScanQR();
    await new Promise(r => setTimeout(r, 50));
    expect(rejections).toEqual([]);
  });

  it('даже с ранее выставленным кешем готовности плагин не дёргается', async () => {
    localStorage.setItem(READY, '1');
    expect(isNativeScanReady()).toBe(false); // регистрация важнее кеша
    expect((await nativeScanQR()).status).toBe('unavailable');
    expect(pluginTouched).not.toHaveBeenCalled();
  });
});

describe('нативный сканер — обычный веб', () => {
  beforeEach(() => {
    platform.native = false;
    platform.name = 'web';
    platform.plugins = new Set([PLUGIN]); // даже если бы имя нашлось
  });

  it('в вебе нативного сканера нет и плагин не грузится', async () => {
    expect(isNativeScanReady()).toBe(false);
    await warmUpNativeScanner();
    expect((await nativeScanQR()).status).toBe('unavailable');
    expect(pluginTouched).not.toHaveBeenCalled();
  });
});
