import { Capacitor } from '@capacitor/core';

// Нативное сканирование QR в приложении. В вебе и Telegram-миниаппе нативного
// слоя нет — там остаётся html5-qrcode, как и было.
//
// Плагин один на обе платформы — @capacitor/barcode-scanner (движок OutSystems).
// К этому пришли не сразу: на Android сначала стоял ML Kit от Google, но он
// требовал докачивать модуль распознавания из Play services — а значит зависел от
// сети, версии сервисов и вообще их наличия, и проверить этот путь было негде.
// На iOS его подключить не удалось вовсе: наш iOS-проект собран на Swift Package
// Manager, а ML Kit поставляется только через CocoaPods.
//
// У @capacitor/barcode-scanner модель распознавания вшита в приложение: качать
// нечего, работает офлайн и без Play services. Обе платформы ходят одним и тем же
// путём, с одинаковыми параметрами, и отвечают одинаковыми кодами ошибок
// (OS-PLUG-BARC-NNNN из общей библиотеки Ionic) — поэтому и поведение одинаковое.
//
// На обеих платформах это полноэкранное системное окно: оно само рисует камеру и
// рамку, само закрывается после чтения кода. В отличие от режима наложения, не
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

/** Имя, под которым плагин регистрируется в Capacitor (jsName). */
const PLUGIN = 'CapacitorBarcodeScanner';

/**
 * Собран ли нативный сканер в это приложение. Спрашиваем сам Capacitor — он знает
 * это без единого вызова в плагин. Без такой проверки любое обращение на
 * платформе, где плагин не собран, отвечает отказом «plugin is not implemented»,
 * и такие отказы валятся в лог ошибок приложения. Проверка синхронная и
 * бесплатная, поэтому стоит первой везде.
 */
function isPluginRegistered(): boolean {
  try {
    return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable(PLUGIN);
  } catch {
    return false;
  }
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
  if (!isPluginRegistered()) return false;
  try { return localStorage.getItem(READY_KEY) === '1'; } catch { return false; }
}

function setReady(ready: boolean) {
  try {
    if (ready) localStorage.setItem(READY_KEY, '1');
    else localStorage.removeItem(READY_KEY);
  } catch { /* приватный режим — просто останется веб-сканер */ }
}

/**
 * Фоновая подготовка при старте приложения. Сканер целиком внутри приложения —
 * докачивать нечего, спрашивать плагин не о чем: достаточно знать, что он собран.
 * Ни одного вызова в плагин, поэтому ни задержек, ни записей в логе ошибок.
 *
 * Отдельный шаг нужен только затем, чтобы снятая после поломки отметка вернулась
 * при следующем запуске приложения.
 */
export async function warmUpNativeScanner(): Promise<void> {
  setReady(isPluginRegistered());
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
    const raw = await readNative();
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
 * Открыть окно сканера. Путь общий для обеих платформ и параметры одни и те же —
 * просим только QR, ничего больше.
 *
 * Доступ к камере плагин спрашивает сам и при отказе отвечает своим кодом, поэтому
 * отдельной проверки разрешений здесь нет — она была бы лишней задержкой перед
 * камерой.
 *
 * Потолок стоит только на импорте: чанк плагина грузится через service worker, и
 * если запрос за ним подвиснет, без потолка экран сканирования встанет навсегда.
 * На само открытие окна потолка нет — там человек, и он вправе целиться в код
 * сколько нужно.
 */
async function readNative(): Promise<string | undefined> {
  const mod = await withTimeout(import('@capacitor/barcode-scanner'), 3000);
  const result = await mod.CapacitorBarcodeScanner.scanBarcode({
    hint: mod.CapacitorBarcodeScannerTypeHint.QR_CODE,
  });
  return result?.ScanResult;
}
