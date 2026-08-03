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

// Глобальные ловушки — ошибки вне React (async, промисы). Ставятся один раз.
let installed = false;
export function installGlobalErrorLogging(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;

  window.addEventListener('error', (e) => {
    logClientError({
      section: 'global',
      message: e.message || String(e.error?.message || 'unknown error'),
      stack: e.error?.stack,
    });
  });

  window.addEventListener('unhandledrejection', (e) => {
    const reason = e.reason;
    logClientError({
      section: 'promise',
      message: typeof reason === 'string' ? reason : (reason?.message || 'unhandled rejection'),
      stack: reason?.stack,
    });
  });
}
