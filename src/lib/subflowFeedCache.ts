/**
 * Кеш первой страницы ленты SubFlow — чтобы при возврате в раздел лента
 * появлялась мгновенно, а не собиралась заново с нуля.
 *
 * Осознанные ограничения (важны для корректности):
 *   • кешируется ТОЛЬКО первая страница — догруженные при скролле посты не
 *     сохраняем, иначе пришлось бы синхронизировать курсор пагинации;
 *   • кеш привязан к пользователю и к фильтру по кофейне — иначе при смене
 *     аккаунта или переходе в другую кофейню показались бы чужие данные;
 *   • кеш только ПОКАЗЫВАЕТСЯ первым, свежий запрос уходит ВСЕГДА и заменяет
 *     данные целиком — реакции и комментарии не «залипают», а новые посты
 *     подгружаются в фоне и заменяют старую ленту;
 *   • слишком старый кеш (> TTL) не показываем, чтобы не мелькнуть совсем
 *     устаревшей лентой — но свежий запрос всё равно идёт.
 *
 * Хранилище — localStorage: переживает полное закрытие приложения, поэтому при
 * холодном старте лента появляется мгновенно из кеша, а свежая грузится в фоне.
 * Кеш привязан к пользователю и чистится при выходе (clearFeedCache).
 */

const CACHE_VERSION = 'v2'; // сменили хранилище/окно — инвалидируем старый кеш
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24ч — показываем кеш при переоткрытии, свежее грузим в фоне

interface CachedFeed<T> {
  version: string;
  savedAt: number;
  userId: string | null;
  shopFilter: string | null;
  posts: T[];
}

function keyFor(userId: string | null, shopFilter: string | null | undefined): string {
  return `subflow_feed_${CACHE_VERSION}_${userId || 'anon'}_${shopFilter || 'all'}`;
}

export function readFeedCache<T>(userId: string | null, shopFilter: string | null | undefined): T[] | null {
  try {
    const raw = localStorage.getItem(keyFor(userId, shopFilter));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedFeed<T>;
    if (parsed.version !== CACHE_VERSION) return null;
    if (parsed.userId !== (userId || null)) return null;
    if (parsed.shopFilter !== (shopFilter || null)) return null;
    if (Date.now() - parsed.savedAt > CACHE_TTL_MS) return null;
    return Array.isArray(parsed.posts) && parsed.posts.length > 0 ? parsed.posts : null;
  } catch {
    return null; // повреждённый кеш не должен ломать ленту
  }
}

export function writeFeedCache<T>(
  userId: string | null,
  shopFilter: string | null | undefined,
  posts: T[],
): void {
  try {
    const payload: CachedFeed<T> = {
      version: CACHE_VERSION,
      savedAt: Date.now(),
      userId: userId || null,
      shopFilter: shopFilter || null,
      posts,
    };
    localStorage.setItem(keyFor(userId, shopFilter), JSON.stringify(payload));
  } catch {
    /* переполнение квоты хранилища не должно ломать ленту */
  }
}

/** Сброс кеша — например, после выхода из аккаунта. */
export function clearFeedCache(): void {
  try {
    const toRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('subflow_feed_')) toRemove.push(k);
    }
    toRemove.forEach(k => localStorage.removeItem(k));
  } catch {
    /* игнорируем */
  }
}
