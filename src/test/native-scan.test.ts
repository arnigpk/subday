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

// Любое обращение к плагину на платформе, где он не собран, считается
// нарушением: оно возвращает отказ «not implemented», и тот попадает в лог
// ошибок. Плюс каждая платформа не должна трогать чужой плагин.
const mlkitTouched = vi.fn();
// Поведение scan() задаём из тестов — так проверяем отмену, отказ в камере и
// настоящую поломку по отдельности.
const scanImpl = { run: async (): Promise<{ barcodes: { rawValue: string }[] }> => ({ barcodes: [] }) };
const mlkit = {
  isSupported: vi.fn(),
  isGoogleBarcodeScannerModuleAvailable: vi.fn(),
  installGoogleBarcodeScannerModule: vi.fn(),
  scan: () => scanImpl.run(),
};
vi.mock('@capacitor-mlkit/barcode-scanning', () => ({
  get BarcodeScanner() {
    mlkitTouched();
    return mlkit;
  },
}));

const iosTouched = vi.fn();
const scanBarcode = vi.fn();
vi.mock('@capacitor/barcode-scanner', () => ({
  get CapacitorBarcodeScanner() {
    iosTouched();
    return { scanBarcode };
  },
  CapacitorBarcodeScannerTypeHint: { QR_CODE: 0 },
}));

import { isNativeScanReady, warmUpNativeScanner, nativeScanQR } from '@/lib/nativeScan';

const READY = 'native_scan_ready';

/** Отказ ровно в том виде, в каком его отдаёт нативный слой iOS-плагина. */
function iosError(code: string) {
  return Object.assign(new Error('native'), { code });
}

beforeEach(() => {
  mlkitTouched.mockClear();
  iosTouched.mockClear();
  scanBarcode.mockReset();
  mlkit.isSupported.mockReset();
  mlkit.isGoogleBarcodeScannerModuleAvailable.mockReset();
  mlkit.installGoogleBarcodeScannerModule.mockReset();
  scanImpl.run = async () => ({ barcodes: [] });
  localStorage.clear();
  platform.native = true;
  platform.name = 'ios';
  platform.plugins = new Set();
});

describe('нативный сканер — iOS, плагин собран', () => {
  beforeEach(() => {
    platform.plugins = new Set(['CapacitorBarcodeScanner']);
  });

  it('прогрев включает сканер, не сделав ни одного вызова в плагин', async () => {
    expect(isNativeScanReady()).toBe(false); // до прогрева не знаем
    await warmUpNativeScanner();
    expect(isNativeScanReady()).toBe(true);
    expect(iosTouched).not.toHaveBeenCalled();
  });

  it('читает код и просит именно QR', async () => {
    localStorage.setItem(READY, '1');
    scanBarcode.mockResolvedValue({ ScanResult: 'subday://redeem/42', format: 0 });
    expect(await nativeScanQR()).toEqual({ status: 'scanned', value: 'subday://redeem/42' });
    expect(scanBarcode).toHaveBeenCalledWith({ hint: 0 });
  });

  it('закрыли окно → «отмена», сканер остаётся готовым', async () => {
    localStorage.setItem(READY, '1');
    scanBarcode.mockRejectedValue(iosError('OS-PLUG-BARC-0006'));
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
    scanBarcode.mockRejectedValue(iosError('OS-PLUG-BARC-0007'));
    expect((await nativeScanQR()).status).toBe('unavailable');
    // Разрешение могут выдать позже — плагин не должен отключаться навсегда.
    expect(localStorage.getItem(READY)).toBe('1');
  });

  it('плагин действительно сломан → «недоступен» и готовность снимается', async () => {
    localStorage.setItem(READY, '1');
    scanBarcode.mockRejectedValue(iosError('OS-PLUG-BARC-0004'));
    expect((await nativeScanQR()).status).toBe('unavailable');
    expect(localStorage.getItem(READY)).toBeNull();
  });

  it('не трогает ML Kit — на iOS его в сборке нет', async () => {
    scanBarcode.mockResolvedValue({ ScanResult: 'x', format: 0 });
    await warmUpNativeScanner();
    await nativeScanQR();
    expect(mlkitTouched).not.toHaveBeenCalled();
  });
});

describe('нативный сканер — плагин не зарегистрирован на платформе', () => {
  let rejections: unknown[];
  const catchRejection = (e: PromiseRejectionEvent) => { rejections.push(e.reason); };

  beforeEach(() => {
    rejections = [];
    platform.plugins = new Set(); // плагин в сборку не попал — как на iOS без cap sync
    window.addEventListener('unhandledrejection', catchRejection);
  });

  afterEach(() => {
    window.removeEventListener('unhandledrejection', catchRejection);
  });

  it('готовность = нет, и плагин не тронут ни разу', () => {
    expect(isNativeScanReady()).toBe(false);
    expect(iosTouched).not.toHaveBeenCalled();
    expect(mlkitTouched).not.toHaveBeenCalled();
  });

  it('фоновый прогрев молчит и не трогает плагин', async () => {
    await warmUpNativeScanner();
    expect(iosTouched).not.toHaveBeenCalled();
    expect(mlkitTouched).not.toHaveBeenCalled();
    expect(isNativeScanReady()).toBe(false);
  });

  it('сканирование сразу отдаёт «недоступно» — экран уйдёт на камеру', async () => {
    expect((await nativeScanQR()).status).toBe('unavailable');
    expect(iosTouched).not.toHaveBeenCalled();
    expect(mlkitTouched).not.toHaveBeenCalled();
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
    expect(iosTouched).not.toHaveBeenCalled();
    expect(mlkitTouched).not.toHaveBeenCalled();
  });
});

describe('нативный сканер — Android, ML Kit', () => {
  beforeEach(() => {
    platform.name = 'android';
    platform.plugins = new Set(['BarcodeScanner']);
  });

  it('прогрев с готовым модулем Play services включает нативный сканер', async () => {
    mlkit.isSupported.mockResolvedValue({ supported: true });
    mlkit.isGoogleBarcodeScannerModuleAvailable.mockResolvedValue({ available: true });
    await warmUpNativeScanner();
    expect(isNativeScanReady()).toBe(true);
    expect(mlkit.installGoogleBarcodeScannerModule).not.toHaveBeenCalled();
  });

  it('пока модуль не докачан, готовым не притворяется', async () => {
    mlkit.isSupported.mockResolvedValue({ supported: true });
    mlkit.isGoogleBarcodeScannerModuleAvailable.mockResolvedValue({ available: false });
    mlkit.installGoogleBarcodeScannerModule.mockResolvedValue(undefined);
    await warmUpNativeScanner();
    expect(mlkit.installGoogleBarcodeScannerModule).toHaveBeenCalled();
    expect(isNativeScanReady()).toBe(false);
  });

  it('закрыли окно крестиком → «отмена», плагин остаётся готовым', async () => {
    localStorage.setItem(READY, '1');
    scanImpl.run = () => Promise.reject(new Error('scan canceled.'));
    expect((await nativeScanQR()).status).toBe('cancelled');
    expect(localStorage.getItem(READY)).toBe('1'); // сбоем не считаем
  });

  it('нет доступа к камере → «недоступен», но готовность не снимаем', async () => {
    localStorage.setItem(READY, '1');
    scanImpl.run = () => Promise.reject(new Error('User denied access to camera.'));
    expect((await nativeScanQR()).status).toBe('unavailable');
    expect(localStorage.getItem(READY)).toBe('1');
  });

  it('плагин действительно сломан → «недоступен» и готовность снимается', async () => {
    localStorage.setItem(READY, '1');
    scanImpl.run = () => Promise.reject(new Error('No capture device available.'));
    expect((await nativeScanQR()).status).toBe('unavailable');
    expect(localStorage.getItem(READY)).toBeNull();
  });

  it('прочитан любой код — это успех сканера, содержимое его не касается', async () => {
    // QR чужой кофейни, не-subday код, уже использованный — для сканера это
    // одинаково успешная работа. Разбирается дальше, экраном.
    localStorage.setItem(READY, '1');
    scanImpl.run = () => Promise.resolve({ barcodes: [{ rawValue: 'что-угодно' }] });
    expect(await nativeScanQR()).toEqual({ status: 'scanned', value: 'что-угодно' });
    expect(localStorage.getItem(READY)).toBe('1');
  });

  it('не трогает iOS-плагин', async () => {
    localStorage.setItem(READY, '1');
    scanImpl.run = () => Promise.resolve({ barcodes: [{ rawValue: 'x' }] });
    await nativeScanQR();
    expect(iosTouched).not.toHaveBeenCalled();
  });
});

describe('нативный сканер — обычный веб', () => {
  beforeEach(() => {
    platform.native = false;
    platform.name = 'web';
    // В вебе у плагина есть своя реализация, поэтому Capacitor считает его
    // доступным. Нативным сканером это не делает — проверка платформы важнее.
    platform.plugins = new Set(['CapacitorBarcodeScanner', 'BarcodeScanner']);
  });

  it('в вебе нативного сканера нет и плагины не грузятся', async () => {
    expect(isNativeScanReady()).toBe(false);
    await warmUpNativeScanner();
    expect((await nativeScanQR()).status).toBe('unavailable');
    expect(iosTouched).not.toHaveBeenCalled();
    expect(mlkitTouched).not.toHaveBeenCalled();
  });
});
