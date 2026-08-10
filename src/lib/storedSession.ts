import type { Session } from '@supabase/supabase-js';

/** Дольше этого не держим человека на прелоадере, чего бы ни ждала сеть. */
export const AUTH_WAIT_CAP_MS = 2500;

/**
 * Сохранённая сессия прямо из localStorage, без обращения к сети.
 *
 * Нужна на старте приложения. getSession() выглядит локальным, но если срок
 * действия токена истёк, внутри он идёт обновлять его по сети — а на плохой связи
 * supabase-js ещё и повторяет попытку с нарастающей паузой. Всё это время
 * приложение стояло на прелоадере.
 *
 * Сама сессия при этом уже лежит в хранилище, и её достаточно, чтобы решить,
 * какой экран показать. Права это не ослабляет: доступ к данным решает RLS на
 * сервере, а не то, что клиент думает о себе.
 *
 * supabase-js кладёт сессию под ключ вида `sb-<ref>-auth-token`, где ref зависит
 * от адреса проекта, — поэтому ищем по форме ключа, а не по точному имени.
 */
export function readStoredSession(): Session | null {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !/^sb-.+-auth-token$/.test(key)) continue;
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      if (parsed?.access_token && parsed?.user) return parsed as Session;
    }
  } catch { /* нет доступа к хранилищу — просто подождём сеть */ }
  return null;
}
