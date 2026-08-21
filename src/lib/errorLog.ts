import { supabase } from '@/integrations/supabase/client';
import { Capacitor } from '@capacitor/core';

// Своё логирование клиентских ошибок (вместо внешнего Sentry): отправляет
// обезличенный отчёт в edge-функцию log-client-error → таблица client_error_logs.
// Fire-and-forget: никогда не бросает исключений и не блокирует UI.

// Защита от спама: не больше N отправок за сессию и дедуп одинаковых сообщений,
// чтобы циклическая ошибка не залила таблицу.
// Потолок поднят с 15: теперь в журнал сообщают и ошибки запросов, а их источников
// в приложении на порядок больше. Дедуп по сообщению всё равно не даст одной
// зациклившейся ошибке съесть лимит, так что риск залить таблицу не вырос.
const MAX_PER_SESSION = 25;
let sentCount = 0;
const seen = new Set<string>();

// Известный безобидный шум — ожидаемые и уже обработанные состояния, которые
// не являются ошибками и только засоряют лог. Не логируем их вовсе.
const IGNORED_SUBSTRINGS = [
  'messaging/unsupported-browser',   // браузер/webview без web-push — ожидаемо, есть фолбэк
  'ResizeObserver loop',             // безвредное предупреждение браузера
  'operation was aborted',           // отмена запроса при навигации/размонтировании — не ошибка
  'AbortError',                      // то же самое (fetch cancel)
];

interface ClientErrorReport {
  section?: string;
  message?: string;
  stack?: string;
  componentStack?: string;
}

export function logClientError(report: ClientErrorReport): void {
  try {
    if (sentCount >= MAX_PER_SESSION) return;
    // Отсекаем известный безобидный шум ещё до дедупа и отправки.
    if (report.message && IGNORED_SUBSTRINGS.some(s => report.message!.includes(s))) return;
    const dedupKey = `${report.section || ''}|${report.message || ''}`;
    if (seen.has(dedupKey)) return;
    seen.add(dedupKey);
    sentCount += 1;

    const payload = {
      section: report.section,
      message: report.message,
      stack: report.stack,
      componentStack: report.componentStack,
      url: typeof location !== 'undefined' ? location.href : undefined,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
      appVersion: typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : undefined,
      platform: Capacitor.getPlatform(), // 'web' | 'ios' | 'android'
    };

    // invoke сам подставит apikey и Authorization (если есть сессия) — на сервере
    // из токена определим user_id. Ошибку самой отправки молча глотаем.
    supabase.functions.invoke('log-client-error', { body: payload }).catch(() => { /* ignore */ });
  } catch { /* логирование не должно ломать приложение */ }
}

/**
 * Правда ли, что связи нет. Нужна там, где пользователю показывают причину:
 * говорить «нет сети» при работающей сети — значит скрыть настоящую поломку и
 * от человека, и от себя. Браузер знает только про интерфейс, а не про то,
 * доходят ли пакеты до сервера, поэтому это подсказка, а не приговор — но
 * отличить «самолётный режим» от «сервер молчит» её достаточно.
 */
export function isOffline(): boolean {
  try {
    return typeof navigator !== 'undefined' && navigator.onLine === false;
  } catch {
    return false;
  }
}

/**
 * Ошибка запроса к данным. Заводится отдельно от logClientError, потому что таких
 * мест в приложении сотни, и раньше они гасились одним console.error — до журнала
 * в админке не доходило ничего. В итоге о сбоях узнавали только от людей.
 *
 * Ошибки отмены (уход со страницы, размонтирование) отсеиваются самим
 * logClientError, так что вызывать можно свободно, из любого catch.
 */
/**
 * Читаемый текст ошибки. Простого String() тут мало: Supabase отдаёт сбой обычным
 * объектом, а не Error, и в журнал уходило бесполезное «[object Object]» — вместо
 * причины оставался один факт, что что-то сломалось. Достаём поля, которые
 * действительно объясняют: сообщение, код, подробности, подсказку.
 */
function describeError(error: unknown): string {
  if (error instanceof Error) return error.message || error.name;
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object') {
    const o = error as Record<string, unknown>;
    const parts = [o.message, o.code, o.details, o.hint, o.error_description, o.error]
      .filter(v => typeof v === 'string' && v)
      .map(v => v as string);
    if (parts.length) return [...new Set(parts)].join(' | ');
    try {
      const json = JSON.stringify(error);
      if (json && json !== '{}') return json.slice(0, 300);
    } catch { /* циклическая ссылка — ниже отдадим общий текст */ }
    return 'объект без текста ошибки';
  }
  return String(error ?? 'unknown');
}

export function logDataError(section: string, error: unknown, what?: string): void {
  const raw = describeError(error);
  // Помечаем обрыв связи прямо в сообщении: в журнале это сразу отделит настоящие
  // поломки от людей в метро.
  const prefix = isOffline() ? '[оффлайн] ' : '';
  logClientError({
    section,
    message: `${prefix}${what ? what + ': ' : ''}${raw}`,
    stack: error instanceof Error ? error.stack : undefined,
  });
}

// Осечка загрузки чанка. Возникает штатно после выката: у человека открыта
// страница старой сборки, а файлов с прежними хешами на сервере уже нет. Это не
// поломка кода — правильная реакция одна: перезагрузиться и взять новую сборку.
const CHUNK_ERROR_SIGNS = [
  'Importing a module script failed',            // Safari / iOS
  'Failed to fetch dynamically imported module', // Chrome
  'error loading dynamically imported module',   // Firefox
  'Unable to preload CSS',
];
const RELOADED_KEY = 'chunk_reload_done';

/**
 * true — сообщение опознано как устаревший чанк и обработано (перезагрузкой),
 * логировать его не нужно. Перезагружаемся не больше одного раза за сессию:
 * если и после неё не полегчало, причина другая — тогда пусть попадёт в лог
 * как настоящая ошибка, а не крутит страницу в петле.
 *
 * Экспортируется, потому что этот же случай ловит предохранитель React: страницы
 * грузятся лениво, и после выката осечка чанка приходит не в глобальную ловушку,
 * а в componentDidCatch. Без общей проверки человек вместо тихой перезагрузки
 * видел экран ошибки и должен был жать кнопку сам.
 */
export function handledAsStaleChunk(message?: string): boolean {
  if (!message || !CHUNK_ERROR_SIGNS.some(s => message.includes(s))) return false;
  try {
    if (sessionStorage.getItem(RELOADED_KEY)) return false; // уже пробовали — это не оно
    sessionStorage.setItem(RELOADED_KEY, '1');
    location.reload();
  } catch { return false; }
  return true;
}

// Глобальные ловушки — ошибки вне React (async, промисы). Ставятся один раз.
let installed = false;
export function installGlobalErrorLogging(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;

  window.addEventListener('error', (e) => {
    const message = e.message || String(e.error?.message || 'unknown error');
    if (handledAsStaleChunk(message)) return;
    logClientError({ section: 'global', message, stack: e.error?.stack });
  });

  window.addEventListener('unhandledrejection', (e) => {
    const reason = e.reason;
    const message = typeof reason === 'string' ? reason : (reason?.message || 'unhandled rejection');
    if (handledAsStaleChunk(message)) return;
    logClientError({ section: 'promise', message, stack: reason?.stack });
  });
}
