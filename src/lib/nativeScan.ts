import { Capacitor } from '@capacitor/core';

// Нативное сканирование QR в приложении. В вебе и Telegram-миниаппе нативного
// слоя нет — там остаётся html5-qrcode, как и было.
//
// Плагинов два, по одному на платформу, и это вынужденно:
//   Android — ML Kit (@capacitor-mlkit/barcode-scanning);
//   iOS     — @capacitor/barcode-scanner (движок OutSystems).
// ML Kit на iOS подключить нельзя: наш iOS-проект собран на Swift Package
// Manager, а ML Kit от Google поставляется только через CocoaPods и Package.swift
// не имеет. Поэтому `npx cap sync ios` молча пропускал его — плагин в сборку не
// попадал вообще, и на айфоне сканирование всегда уходило на веб-камеру.
// Официальный @capacitor/barcode-scanner с SPM совместим и даёт на iOS то же
// самое: системное полноэкранное окно сканера.
//
// На обеих платформах это именно полноэкранное системное окно: оно само рисует
// камеру и рамку, само закрывается после чтения кода. В отличие от режима
// наложения, не требует делать WebView прозрачным и прятать вёрстку страницы —
// значит нечему «залипнуть» и оставить приложение невидимым. Это осознанный
// выбор в пользу надёжности: сканирование — это списание, ломать его нельзя.
//
// Любая ошибка возвращает 'unavailable' — вызывающий код молча показывает
// привычный веб-сканер, поэтому сканирование не может перестать работать.

type ScanOutcome =
  | { status: 'scanned'; value: string }
  | { status: 'cancelled' }
  | { status: 'unavailable' };

/** Имена, под которыми плагины регистрируются в Capacitor (jsName). */
const IOS_PLUGIN = 'CapacitorBarcodeScanner';
const ANDROID_PLUGIN = 'BarcodeScanner';

/**
 * Какой нативный сканер реально собран в это приложение. Спрашиваем сам
 * Capacitor — он знает это без единого вызова в плагин. Без такой проверки любое
 * обращение на платформе, где плагин не собран, отвечает отказом «plugin is not
 * implemented», и такие отказы валятся в лог ошибок приложения. Проверка
 * синхронная и бесплатная, поэтому стоит первой везде.
 */
function backend(): 'ios' | 'android' | null {
  try {
    if (!Capacitor.isNativePlatform()) return null;
    const platform = Capacitor.getPlatform();
    if (platform === 'ios') return Capacitor.isPluginAvailable(IOS_PLUGIN) ? 'ios' : null;
    if (platform === 'android') return Capacitor.isPluginAvailable(ANDROID_PLUGIN) ? 'android' : null;
    return null;
  } catch {
    return null;
  }
}

/** Ленивый импорт: в вебе плагины вообще не грузим. */
async function loadMlkit() {
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
  // Гонку выигрывает один, но отказать может и проигравший — уже после того, как
  // результат получен. Такой поздний отказ некому поймать, и он всплывает как
  // «непойманное отклонение промиса» в логе ошибок. Поэтому обеим сторонам сразу
  // вешаем пустой обработчик: гонка на это не влияет, а всплыть уже нечему.
  p.catch(() => { /* поздний отказ проигравшего — не ошибка */ });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const bell = new Promise<T>((_, reject) => {
    timer = setTimeout(() => reject(new Error('native-scan-timeout')), ms);
  });
  bell.catch(() => { /* таймер отзвонил после ответа — не ошибка */ });
  return Promise.race([p, bell]).finally(() => { if (timer) clearTimeout(timer); });
}

// Плагин сообщает обо всём одинаково — отказом промиса. Но закрытие окна человеком
// и поломка плагина — разные вещи, и путать их нельзя: из-за этого закрытие сканера
// выглядело как сбой и предлагало запасную камеру.
//
// Ошибка сканера — это только когда сам плагин не может работать. Неподходящий QR,
// код чужой кофейни, уже использованный код — к сканеру отношения не имеют: он свою
// работу сделал, прочитал. Такие случаи разбирает вызывающий экран и просто
// открывает сканер снова.
const CANCEL_SIGNS = ['scan canceled', 'scan cancelled'];
const PERMISSION_SIGNS = ['denied access to camera', 'permission'];

// iOS-плагин отвечает не текстом, а точным кодом — по нему и различаем. Это
// надёжнее разбора сообщения: код не зависит от языка и от версии плагина.
const IOS_CANCEL_CODE = 'OS-PLUG-BARC-0006';
const IOS_PERMISSION_CODE = 'OS-PLUG-BARC-0007';

type Failure = 'cancelled' | 'permission' | 'broken';

function classifyFailure(err: unknown): Failure {
  const code = (err as { code?: unknown } | null)?.code;
  if (code === IOS_CANCEL_CODE) return 'cancelled';
  if (code === IOS_PERMISSION_CODE) return 'permission';
  const msg = (err instanceof Error ? err.message : String(err ?? '')).toLowerCase();
  if (CANCEL_SIGNS.some((s) => msg.includes(s))) return 'cancelled';
  if (PERMISSION_SIGNS.some((s) => msg.includes(s))) return 'permission';
  return 'broken';
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
  if (!backend()) return false;
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
  const which = backend();
  // Плагина на платформе нет — молчим. Ни одного вызова, ни одной ошибки в логе.
  if (!which) { setReady(false); return; }
  // iOS: сканер целиком внутри приложения — докачивать нечего, спрашивать плагин
  // не о чем. Помечаем готовым сразу, без единого вызова в него.
  if (which === 'ios') { setReady(true); return; }
  try {
    const BarcodeScanner = await withTimeout(loadMlkit(), 5000);
    const { supported } = await withTimeout(BarcodeScanner.isSupported(), 5000);
    if (!supported) { setReady(false); return; }

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
  const which = backend();
  if (!which || !isNativeScanReady()) return { status: 'unavailable' };
  try {
    const raw = which === 'ios' ? await readIOS() : await readAndroid();
    if (!raw) return { status: 'cancelled' };   // закрыли окно, ничего не прочитав
    return { status: 'scanned', value: raw };
  } catch (err) {
    const kind = classifyFailure(err);
    // Закрыли окно — это не сбой: плагин исправен, запасную камеру не предлагаем
    // и отметку готовности не трогаем.
    if (kind === 'cancelled') return { status: 'cancelled' };
    // Нет доступа к камере — сканер работать не может, но плагин цел: отметку
    // оставляем, чтобы после выдачи разрешения он заработал без перезапуска.
    if (kind === 'permission') return { status: 'unavailable' };
    // Настоящая поломка плагина — снимаем готовность, дальше работает камера.
    setReady(false);
    return { status: 'unavailable' };
  }
}

/**
 * iOS. Доступ к камере плагин спрашивает сам и при отказе отвечает своим кодом,
 * поэтому отдельной проверки разрешений здесь нет — она была бы лишней задержкой
 * перед камерой.
 *
 * Потолок стоит только на импорте: чанк плагина грузится через service worker, и
 * если запрос за ним подвиснет, без потолка экран сканирования встанет навсегда.
 * На само открытие окна потолка нет — там человек, и он вправе целиться в код
 * сколько нужно.
 */
async function readIOS(): Promise<string | undefined> {
  const mod = await withTimeout(import('@capacitor/barcode-scanner'), 3000);
  const result = await mod.CapacitorBarcodeScanner.scanBarcode({
    hint: mod.CapacitorBarcodeScannerTypeHint.QR_CODE,
  });
  return result?.ScanResult;
}

/** Android. При scan() разрешение не требуется — окно рисует сервис Google. */
async function readAndroid(): Promise<string | undefined> {
  const BarcodeScanner = await withTimeout(loadMlkit(), 3000);
  const { barcodes } = await BarcodeScanner.scan();
  return barcodes?.[0]?.rawValue;
}
