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

const READY_KEY = 'native_scan_ready';

/**
 * Готов ли системный сканер — ответ МГНОВЕННЫЙ, из кеша, без единого вызова
 * плагина. Это принципиально: спрашивать плагин в момент открытия экрана нельзя,
 * иначе человек ждёт проверку перед камерой, и сканирование становится медленнее,
 * чем было вообще без плагина. Не знаем наверняка → считаем, что не готов, и
 * сразу показываем обычную камеру. Кеш обновляет фоновый прогрев.
 */
export function isNativeScanReady(): boolean {
  if (!Capacitor.isNativePlatform()) return false;
  try { return localStorage.getItem(READY_KEY) === '1'; } catch { return false; }
}

function setReady(ready: boolean) {
  try {
    if (ready) localStorage.setItem(READY_KEY, '1');
    else localStorage.removeItem(READY_KEY);
  } catch { /* приватный режим — просто останется веб-сканер */ }
}

/**
 * Фоновая подготовка при старте приложения: выясняем, доступен ли системный
 * сканер, и при необходимости просим Play services докачать модуль. Результат
 * кладём в кеш, чтобы экран сканирования знал ответ заранее и открывался без
 * задержки. Ничего не показывает и не бросает.
 */
export async function warmUpNativeScanner(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const BarcodeScanner = await withTimeout(loadPlugin(), 5000);
    const { supported } = await withTimeout(BarcodeScanner.isSupported(), 5000);
    if (!supported) { setReady(false); return; }

    if (Capacitor.getPlatform() !== 'android') { setReady(true); return; }

    const { available } = await withTimeout(BarcodeScanner.isGoogleBarcodeScannerModuleAvailable(), 5000);
    if (available) { setReady(true); return; }

    // Модуля нет. Пока он качается, сканирование идёт обычной камерой — никто не
    // ждёт. Готовым помечаем только после успешной установки, поэтому лишнего
    // лоадера перед камерой не появится ни разу.
    setReady(false);
    await BarcodeScanner.installGoogleBarcodeScannerModule();
    const after = await withTimeout(BarcodeScanner.isGoogleBarcodeScannerModuleAvailable(), 5000);
    setReady(after.available);
  } catch {
    setReady(false);
  }
}

/**
 * Открыть нативный сканер и дождаться результата.
 * 'scanned'     — код прочитан (value);
 * 'cancelled'   — пользователь закрыл окно сканера;
 * 'unavailable' — нативный сканер недоступен → показываем веб-сканер.
 */
export async function nativeScanQR(): Promise<ScanOutcome> {
  // Вызывается только когда кеш уже сказал «готов», поэтому проверок доступности
  // здесь нет: они бы снова встали задержкой перед камерой. Если что-то всё же
  // пошло не так — сбрасываем кеш, и следующее открытие пойдёт сразу на камеру.
  if (!isNativeScanReady()) return { status: 'unavailable' };
  try {
    // Потолок на импорт: чанк плагина грузится через service worker, и если запрос
    // за ним подвиснет, без потолка экран сканирования встанет навсегда.
    const BarcodeScanner = await withTimeout(loadPlugin(), 3000);

    if (Capacitor.getPlatform() !== 'android') {
      // iOS: нужен доступ к камере (на Android при scan() он не требуется —
      // окно рисует сервис Google).
      const perm = await withTimeout(BarcodeScanner.checkPermissions(), 2500);
      if (perm.camera !== 'granted' && perm.camera !== 'limited') {
        const asked = await BarcodeScanner.requestPermissions();
        if (asked.camera !== 'granted' && asked.camera !== 'limited') {
          setReady(false);
          return { status: 'unavailable' };
        }
      }
    }

    const { barcodes } = await BarcodeScanner.scan();
    const raw = barcodes?.[0]?.rawValue;
    if (!raw) return { status: 'cancelled' };   // закрыли окно, ничего не прочитав
    return { status: 'scanned', value: raw };
  } catch {
    // Отмена на некоторых прошивках прилетает исключением — трактуем мягко:
    // показываем привычный веб-сканер, а не пустой экран. И снимаем отметку
    // готовности, чтобы следующее открытие не тратило время на плагин.
    setReady(false);
    return { status: 'unavailable' };
  }
}
