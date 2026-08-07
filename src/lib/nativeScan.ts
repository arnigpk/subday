import { Capacitor } from '@capacitor/core';

// Нативное сканирование QR (ML Kit) для приложения. В вебе и Telegram-миниаппе
// нативного слоя нет — там остаётся html5-qrcode, как и было.
//
// Используем режим scan() — системное полноэкранное окно сканера: оно само рисует
// камеру и рамку, само закрывается после чтения кода. В отличие от startScan(), не
// требует делать WebView прозрачным и прятать вёрстку страницы — значит нечему
// «залипнуть» и оставить приложение невидимым. Это осознанный выбор в пользу
// надёжности: сканирование — это списание, ломать его нельзя.
//
// Любая ошибка возвращает 'unavailable' — вызывающий код молча показывает
// привычный веб-сканер, поэтому сканирование не может перестать работать.

type ScanOutcome =
  | { status: 'scanned'; value: string }
  | { status: 'cancelled' }
  | { status: 'unavailable' };

/** Ленивый импорт: в вебе плагин вообще не грузим. */
async function loadPlugin() {
  const mod = await import('@capacitor-mlkit/barcode-scanning');
  return mod.BarcodeScanner;
}

/** Доступно ли нативное сканирование прямо сейчас (без побочных эффектов). */
export async function isNativeScanAvailable(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;
  try {
    const BarcodeScanner = await loadPlugin();
    const { supported } = await BarcodeScanner.isSupported();
    if (!supported) return false;
    // Android: модуль сканера от Google Play services может быть ещё не установлен.
    if (Capacitor.getPlatform() === 'android') {
      const { available } = await BarcodeScanner.isGoogleBarcodeScannerModuleAvailable();
      return available;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Заранее подготовить модуль сканера на Android (скачивается один раз).
 * Вызывается в фоне при старте приложения — чтобы первый скан не ждал загрузку.
 * Никогда не бросает и ничего не показывает пользователю.
 */
export async function warmUpNativeScanner(): Promise<void> {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') return;
  try {
    const BarcodeScanner = await loadPlugin();
    const { supported } = await BarcodeScanner.isSupported();
    if (!supported) return;
    const { available } = await BarcodeScanner.isGoogleBarcodeScannerModuleAvailable();
    if (!available) await BarcodeScanner.installGoogleBarcodeScannerModule();
  } catch { /* не удалось — просто останется веб-сканер */ }
}

/**
 * Открыть нативный сканер и дождаться результата.
 * 'scanned'     — код прочитан (value);
 * 'cancelled'   — пользователь закрыл окно сканера;
 * 'unavailable' — нативный сканер недоступен → показываем веб-сканер.
 */
export async function nativeScanQR(): Promise<ScanOutcome> {
  if (!Capacitor.isNativePlatform()) return { status: 'unavailable' };
  try {
    const BarcodeScanner = await loadPlugin();

    const { supported } = await BarcodeScanner.isSupported();
    if (!supported) return { status: 'unavailable' };

    if (Capacitor.getPlatform() === 'android') {
      const { available } = await BarcodeScanner.isGoogleBarcodeScannerModuleAvailable();
      if (!available) {
        try { await BarcodeScanner.installGoogleBarcodeScannerModule(); }
        catch { return { status: 'unavailable' }; }
      }
    } else {
      // iOS: нужен доступ к камере (на Android при scan() он не требуется —
      // окно рисует сервис Google).
      const perm = await BarcodeScanner.checkPermissions();
      if (perm.camera !== 'granted' && perm.camera !== 'limited') {
        const asked = await BarcodeScanner.requestPermissions();
        if (asked.camera !== 'granted' && asked.camera !== 'limited') return { status: 'unavailable' };
      }
    }

    const { barcodes } = await BarcodeScanner.scan();
    const raw = barcodes?.[0]?.rawValue;
    if (!raw) return { status: 'cancelled' };   // закрыли окно, ничего не прочитав
    return { status: 'scanned', value: raw };
  } catch {
    // Отмена на некоторых прошивках прилетает исключением — трактуем мягко:
    // показываем привычный веб-сканер, а не пустой экран.
    return { status: 'unavailable' };
  }
}
