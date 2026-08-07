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

/**
 * Ни одна проверка не имеет права подвесить экран. Часть вызовов плагина уходит
 * в Google Play services, и там промис может не вернуться вообще (нет модуля, нет
 * сети, сервис не отвечает) — без потолка пользователь навсегда остаётся на
 * лоадере. Истёк потолок — считаем, что нативного сканера нет, и показываем
 * привычную камеру.
 */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('native-scan-timeout')), ms)),
  ]);
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
    const { supported } = await withTimeout(BarcodeScanner.isSupported(), 2500);
    if (!supported) return;
    const { available } = await withTimeout(BarcodeScanner.isGoogleBarcodeScannerModuleAvailable(), 2500);
    // Загрузку не ограничиваем по времени: она идёт в фоне при старте приложения
    // и никого не держит — экран сканирования её не ждёт.
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
    // Потолок и на импорт: чанк плагина грузится с диска через service worker, и
    // если запрос за ним подвиснет, без потолка экран сканирования встанет навсегда.
    const BarcodeScanner = await withTimeout(loadPlugin(), 3000);

    const { supported } = await withTimeout(BarcodeScanner.isSupported(), 2500);
    if (!supported) return { status: 'unavailable' };

    if (Capacitor.getPlatform() === 'android') {
      const { available } = await withTimeout(BarcodeScanner.isGoogleBarcodeScannerModuleAvailable(), 2500);
      if (!available) {
        // Модуля ещё нет. НЕ ждём загрузку: она идёт через Play services, может
        // занять минуты, а на устройстве без сети/сервисов не завершается вовсе —
        // экран сканирования тогда навсегда застревает на лоадере. Поэтому
        // ставим загрузку в фоне и сразу отдаём привычную камеру: человек
        // сканирует прямо сейчас, а системный сканер подхватится со следующего раза.
        void BarcodeScanner.installGoogleBarcodeScannerModule().catch(() => {});
        return { status: 'unavailable' };
      }
    } else {
      // iOS: нужен доступ к камере (на Android при scan() он не требуется —
      // окно рисует сервис Google).
      const perm = await withTimeout(BarcodeScanner.checkPermissions(), 2500);
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
