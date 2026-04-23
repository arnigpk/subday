/**
 * Структурированный логгер для Supabase Edge Functions.
 *
 * Делает две вещи:
 *  1. Пишет JSON-строку в console (видно в Supabase Edge Logs).
 *  2. По желанию — сохраняет критичное событие в public.webhook_logs
 *     (через service_role клиент), чтобы СуперАдмин видел понятный отчёт
 *     об успехах/ошибках без копания в edge-логах.
 *
 * Использование:
 *
 *   const logger = createEdgeLogger('geo-notify', supabase);
 *   logger.info('start', { userId });
 *   await logger.persist('info', 'sent', { user_id, shop_id }); // в БД + console
 *   await logger.persist('error', 'fcm_failed', { user_id }, err);
 */

type Level = 'info' | 'warn' | 'error';

type SupabaseLike = any;

interface PersistPayload {
  user_id?: string | null;
  order_id?: string | null;
  [k: string]: any;
}

export function createEdgeLogger(functionName: string, supabase?: SupabaseLike) {
  const log = (level: Level, action: string, payload?: Record<string, any>, err?: unknown) => {
    const entry = {
      ts: new Date().toISOString(),
      fn: functionName,
      level,
      action,
      ...(payload ?? {}),
      ...(err ? { err: err instanceof Error ? `${err.name}: ${err.message}` : String(err) } : {}),
    };
    // single-line JSON — удобно фильтровать в Supabase Edge Logs
    const line = JSON.stringify(entry);
    if (level === 'error') console.error(line);
    else if (level === 'warn') console.warn(line);
    else console.log(line);
  };

  const persist = async (
    level: Level,
    action: string,
    payload: PersistPayload = {},
    err?: unknown,
  ) => {
    log(level, action, payload, err);
    if (!supabase) return;
    try {
      const { user_id = null, order_id = null, ...rest } = payload;
      const errStr = err
        ? err instanceof Error
          ? `${err.name}: ${err.message}`
          : String(err)
        : null;
      await supabase.from('webhook_logs').insert({
        source: 'edge',
        function_name: functionName,
        level,
        event_type: action,
        user_id,
        order_id,
        message: errStr ?? null,
        status: level === 'error' ? 'error' : 'ok',
        payload: { ...rest, ...(errStr ? { error: errStr } : {}) },
      });
    } catch (insertErr) {
      // Не валим основную функцию из-за лога
      console.error(JSON.stringify({
        ts: new Date().toISOString(),
        fn: functionName,
        level: 'error',
        action: 'logger_persist_failed',
        err: insertErr instanceof Error ? insertErr.message : String(insertErr),
      }));
    }
  };

  return {
    info: (action: string, payload?: Record<string, any>) => log('info', action, payload),
    warn: (action: string, payload?: Record<string, any>) => log('warn', action, payload),
    error: (action: string, payload?: Record<string, any>, err?: unknown) =>
      log('error', action, payload, err),
    persist,
  };
}
