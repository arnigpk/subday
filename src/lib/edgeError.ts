/**
 * Текст ошибки из ответа edge-функции.
 *
 * supabase-js кладёт в `error` любой ответ не-2xx, а `data` при этом остаётся
 * пустым. Наши функции отвечают на неверный код статусом 400 и телом
 * `{ "error": "Неверный код. Осталось попыток: 3" }` — то есть внятное
 * сообщение есть, но лежит не там, где его ищут.
 *
 * Важная тонкость: в `context` лежит **сырой Response**, а не разобранный
 * объект (см. FunctionsHttpError в @supabase/functions-js). Прочитать тело
 * можно только асинхронно — синхронный разбор молча возвращал заглушку.
 * Именно поэтому человек видел «Неправильный код, попробуйте ещё раз» вместо
 * счётчика оставшихся попыток.
 *
 * Response можно прочитать один раз, поэтому берём клон: сам объект может
 * понадобиться вызывающему.
 */
export async function edgeErrorText(error: unknown, fallback: string): Promise<string> {
  if (!error) return fallback;

  const ctx = (error as { context?: unknown }).context;

  // Основной случай: context — это Response.
  if (ctx && typeof (ctx as Response).clone === 'function') {
    try {
      const parsed = await (ctx as Response).clone().json();
      if (parsed?.error) return String(parsed.error);
    } catch { /* тело не JSON или уже прочитано — идём дальше */ }
  }

  // Запасные формы: в разных версиях библиотеки встречались и такие.
  const asObj = ctx as { json?: { error?: string }; body?: unknown } | undefined;
  if (asObj?.json && typeof asObj.json === 'object' && asObj.json.error) return asObj.json.error;
  if (typeof asObj?.body === 'string') {
    try {
      const parsed = JSON.parse(asObj.body);
      if (parsed?.error) return String(parsed.error);
    } catch { /* не JSON */ }
  }

  const message = (error as { message?: string }).message;
  if (message) {
    try {
      const parsed = JSON.parse(message);
      if (parsed?.error) return String(parsed.error);
    } catch { /* обычный текст */ }
    // Служебные фразы библиотеки человеку ничего не говорят — прячем их.
    if (!/non-2xx|failed to|network|fetch/i.test(message)) return message;
  }

  return fallback;
}
