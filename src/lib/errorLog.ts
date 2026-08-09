import { supabase } from '@/integrations/supabase/client';
import { Capacitor } from '@capacitor/core';

// Своё логирование клиентских ошибок (вместо внешнего Sentry): отправляет
// обезличенный отчёт в edge-функцию log-client-error → таблица client_error_logs.
// Fire-and-forget: никогда не бросает исключений и не блокирует UI.

// Защита от спама: не больше N отправок за сессию и дедуп одинаковых сообщений,
// чтобы циклическая ошибка не залила таблицу.
const MAX_PER_SESSION = 15;
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
 */
function handledAsStaleChunk(message?: string): boolean {
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
