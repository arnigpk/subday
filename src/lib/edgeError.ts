/**
 * Текст ошибки из ответа edge-функции.
 *
 * supabase-js кладёт в `error` любой ответ не-2xx, а `data` при этом остаётся
 * пустым. Наши функции отвечают на неверный код статусом 400 и телом
 * `{ "error": "Неверный или просроченный код" }` — то есть внятное сообщение
 * есть, но лежит не там, где его ищут. Из-за этого человек видел общее
 * «Ошибка проверки кода» вместо причины.
 *
 * Само тело в разных версиях библиотеки лежит по-разному: то в `context.body`
 * строкой, то в `context.json`, то в тексте самой ошибки. Перебираем всё.
 */
export function edgeErrorText(error: unknown, fallback: string): string {
  if (!error) return fallback;

  const ctx = (error as { context?: { body?: unknown; json?: { error?: string } } }).context;

  if (ctx?.json?.error) return ctx.json.error;

  if (typeof ctx?.body === 'string') {
    try {
      const parsed = JSON.parse(ctx.body);
      if (parsed?.error) return String(parsed.error);
    } catch { /* тело не JSON — идём дальше */ }
  }

  const message = (error as { message?: string }).message;
  if (message) {
    try {
      const parsed = JSON.parse(message);
      if (parsed?.error) return String(parsed.error);
    } catch { /* обычный текст, не JSON */ }
    // Служебные сообщения библиотеки человеку ничего не говорят — прячем их.
    if (!/non-2xx|failed to|network|fetch/i.test(message)) return message;
  }

  return fallback;
}
