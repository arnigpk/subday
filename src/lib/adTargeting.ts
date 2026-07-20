// Единые правила показа рекламы — общие для баннеров и SubFlow.
// Чистые функции (без сети), чтобы логика была одинаковой и предсказуемой в обеих системах.

/** Таймзона для расчёта «сегодня» в дневных лимитах (иначе лимит сбрасывается не тогда). */
export const ADS_TZ_OFFSET_HOURS = 5; // Asia/Almaty (UTC+5)

/** Поля таргетинга, общие для баннера и SubFlow-объявления. */
export interface TargetableAd {
  id: string;
  country?: string | null;
  city?: string | null;
  audience_types?: string[] | null;
  starts_at?: string | null;
  ends_at?: string | null;
  weight?: number | null;
  daily_limit?: number | null;
  min_interval_minutes?: number | null;
  view_budget?: number | null;
  click_limit?: number | null;
  days_of_week?: number[] | null;
  hour_from?: number | null;
  hour_to?: number | null;
  target_subscription_type_ids?: string[] | null;
  ab_split?: number | null;
  views_total?: number | null;
  clicks_total?: number | null;
  shop_id?: string | null;
  behavior_target?: string | null;      // any | new | lapsed | active
  behavior_days?: number | null;
  exclude_visited_days?: number | null;
  target_competitor_shop_ids?: string[] | null;
  pacing?: string | null;               // asap | even
}

/** Отношение пользователя к кофейне: когда был последний раз и был ли вообще. */
export interface ShopAffinity {
  /** shop_id -> время последнего списания. Кофейни без визитов в карте отсутствуют. */
  lastVisitByShop: Map<string, Date>;
}

const daysAgo = (d: Date, now: Date) => (now.getTime() - d.getTime()) / 86_400_000;

/**
 * Поведенческий таргет по своим данным о посещениях:
 *   new    — в этой кофейне не был ни разу;
 *   lapsed — был, но не приходил behavior_days;
 *   active — приходил за последние behavior_days.
 * Плюс исключение недавних гостей и таргет «ходит к конкурентам».
 */
export function matchesBehavior(
  ad: TargetableAd,
  affinity: ShopAffinity | null,
  now: Date = new Date(),
): boolean {
  const target = ad.behavior_target || 'any';
  const comps = ad.target_competitor_shop_ids || [];
  const excl = ad.exclude_visited_days || 0;

  // Ничего поведенческого не настроено — правило не применяем.
  if (target === 'any' && comps.length === 0 && excl === 0) return true;
  // Настроено, но данных о пользователе нет — не показываем: иначе таргет
  // молча превращается в «показать всем».
  if (!affinity) return false;

  const window = ad.behavior_days ?? 30;

  if (comps.length > 0) {
    const visitedCompetitor = comps.some(id => {
      const last = affinity.lastVisitByShop.get(id);
      return !!last && daysAgo(last, now) <= Math.max(window, 30);
    });
    if (!visitedCompetitor) return false;
  }

  if (ad.shop_id) {
    const last = affinity.lastVisitByShop.get(ad.shop_id) || null;

    if (excl > 0 && last && daysAgo(last, now) <= excl) return false;

    if (target === 'new' && last) return false;
    if (target === 'lapsed' && (!last || daysAgo(last, now) <= window)) return false;
    if (target === 'active' && (!last || daysAgo(last, now) > window)) return false;
  } else if (target !== 'any') {
    // Поведение считается относительно кофейни; без неё правило бессмысленно.
    return false;
  }

  return true;
}

/**
 * Равномерная открутка: бюджет показов растягивается на срок кампании, чтобы
 * недельная кампания не сгорала за первый вечер. Без бюджета или без обеих
 * дат растягивать нечего.
 */
export function withinPacing(ad: TargetableAd, now: Date = new Date()): boolean {
  if ((ad.pacing || 'asap') !== 'even') return true;
  const budget = ad.view_budget || 0;
  if (budget <= 0 || !ad.starts_at || !ad.ends_at) return true;

  const start = new Date(ad.starts_at).getTime();
  const end = new Date(ad.ends_at).getTime();
  if (!(end > start)) return true;

  const elapsed = (now.getTime() - start) / (end - start);
  const allowedByNow = budget * Math.min(1, Math.max(0, elapsed));
  // Небольшой аванс, иначе в самом начале кампании показов не будет вовсе.
  return (ad.views_total || 0) < Math.max(1, allowedByNow);
}

/** Начало «сегодня» в рабочей таймзоне (для дневных лимитов). */
export function startOfAdsDay(now: Date = new Date()): Date {
  const shifted = new Date(now.getTime() + ADS_TZ_OFFSET_HOURS * 3600_000);
  shifted.setUTCHours(0, 0, 0, 0);
  return new Date(shifted.getTime() - ADS_TZ_OFFSET_HOURS * 3600_000);
}

/** Период активности (даты «с»/«по»). */
export function matchesDateRange(ad: TargetableAd, now: Date = new Date()): boolean {
  if (ad.starts_at && new Date(ad.starts_at) > now) return false;
  if (ad.ends_at && new Date(ad.ends_at) < now) return false;
  return true;
}

/**
 * Гео. Страна: пусто = всем. Город: пусто = всем; если у объявления город ЗАДАН,
 * а у пользователя города нет — НЕ показываем (раньше показывали всем — это была утечка таргета).
 */
export function matchesGeo(ad: TargetableAd, userCountry: string | null, userCity: string | null): boolean {
  if (ad.country && ad.country !== userCountry) return false;
  if (ad.city) {
    if (!userCity) return false;
    if (ad.city !== userCity) return false;
  }
  return true;
}

/** Дни недели (1=пн … 7=вс). Пусто/NULL = все дни. */
export function matchesDayOfWeek(ad: TargetableAd, now: Date = new Date()): boolean {
  const days = ad.days_of_week;
  if (!days || days.length === 0) return true;
  const local = new Date(now.getTime() + ADS_TZ_OFFSET_HOURS * 3600_000);
  const jsDay = local.getUTCDay();          // 0=вс … 6=сб
  const isoDay = jsDay === 0 ? 7 : jsDay;   // 1=пн … 7=вс
  return days.includes(isoDay);
}

/** Часы показа [hour_from, hour_to). NULL = круглосуточно. Поддерживает переход через полночь. */
export function matchesHours(ad: TargetableAd, now: Date = new Date()): boolean {
  const from = ad.hour_from, to = ad.hour_to;
  if (from == null || to == null) return true;
  if (from === to) return true; // вырожденный случай — считаем «всегда»
  const local = new Date(now.getTime() + ADS_TZ_OFFSET_HOURS * 3600_000);
  const h = local.getUTCHours();
  return from < to ? (h >= from && h < to) : (h >= from || h < to); // второй случай — через полночь
}

/** Бюджет показов и лимит кликов (0/NULL = безлимит). Исчерпан → реклама больше не крутится. */
export function withinBudget(ad: TargetableAd): boolean {
  const vb = ad.view_budget || 0;
  if (vb > 0 && (ad.views_total || 0) >= vb) return false;
  const cl = ad.click_limit || 0;
  if (cl > 0 && (ad.clicks_total || 0) >= cl) return false;
  return true;
}

/** Таргет на конкретные тарифы. Пусто/NULL = всем. */
export function matchesSubscriptionTarget(ad: TargetableAd, userSubTypeIds: string[]): boolean {
  const t = ad.target_subscription_type_ids;
  if (!t || t.length === 0) return true;
  return t.some(id => userSubTypeIds.includes(id));
}

/** Дневной лимит на пользователя (0 = безлимит). */
export function withinDailyLimit(ad: TargetableAd, todayViews: number): boolean {
  const dl = ad.daily_limit || 0;
  return dl <= 0 || todayViews < dl;
}

/** Частотный кап: не чаще 1 раза в N минут одному пользователю (0 = без ограничения). */
export function withinMinInterval(ad: TargetableAd, lastViewAt: Date | null, now: Date = new Date()): boolean {
  const mins = ad.min_interval_minutes || 0;
  if (mins <= 0 || !lastViewAt) return true;
  return now.getTime() - lastViewAt.getTime() >= mins * 60_000;
}

/** Частота «случайно»: место в ленте выбирает система, а не админ. */
export const RANDOM_FREQUENCY = -1;

/** Блок для случайной вставки: в среднем одна реклама на столько постов. */
export const RANDOM_BLOCK_SIZE = 10;

export function isRandomFrequency(ad: { frequency?: number | null }): boolean {
  return (ad.frequency ?? 0) === RANDOM_FREQUENCY;
}

/**
 * Позиция случайной вставки внутри блока.
 *
 * Она псевдослучайна, но ДЕТЕРМИНИРОВАНА: зависит только от объявления, seed
 * и номера блока. Это принципиально — лента догружается порциями и
 * перерисовывается, и настоящий Math.random() переставлял бы рекламу на новое
 * место при каждой перерисовке. Тогда один и тот же показ засчитывался бы
 * несколько раз, а дневной лимит и бюджет «протекали» бы.
 *
 * Seed задаёт пользователь + день, поэтому у разных людей места разные,
 * а на следующий день позиции перетасовываются заново.
 */
export function randomSlotIndex(
  adId: string, seed: string, block: number, blockSize: number = RANDOM_BLOCK_SIZE,
): number {
  const offset = stableHash(`${adId}:${seed}:${block}`) % blockSize;
  return block * blockSize + offset;
}

/** Попадает ли позиция i на случайный слот этого объявления. */
export function matchesRandomSlot(
  adId: string, seed: string, i: number, blockSize: number = RANDOM_BLOCK_SIZE,
): boolean {
  if (i < 0) return false;
  const block = Math.floor(i / blockSize);
  return randomSlotIndex(adId, seed, block, blockSize) === i;
}

/** Ключ дня для seed — чтобы позиции менялись раз в сутки, а не при каждом рендере. */
export function adsDayKey(now: Date = new Date()): string {
  return startOfAdsDay(now).toISOString().slice(0, 10);
}

/** Стабильный хеш (одна и та же пара user+ad всегда даёт один результат). */
function stableHash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/**
 * A/B-вариант креатива. ab_split = 0 → всегда A. 1..99 → доля показов варианта B.
 * Выбор СТАБИЛЕН для пользователя (иначе статистика A/B размывается).
 */
export function pickAbVariant(ad: TargetableAd, userId: string | null): 'A' | 'B' {
  const split = ad.ab_split || 0;
  if (split <= 0) return 'A';
  if (split >= 100) return 'B';
  const bucket = stableHash(`${ad.id}:${userId || 'anon'}`) % 100;
  return bucket < split ? 'B' : 'A';
}

/**
 * Взвешенная ротация: возвращает список в порядке, где объявления с бо́льшим weight
 * чаще оказываются впереди. Детерминировано по seed (стабильно в рамках сессии/пользователя).
 */
export function weightedOrder<T extends TargetableAd>(ads: T[], seed: string): T[] {
  return ads
    .map(ad => {
      const w = Math.max(1, ad.weight || 1);
      // Чем больше вес — тем меньше ключ (раньше в списке). Детерминированный джиттер.
      const r = (stableHash(`${seed}:${ad.id}`) % 10_000) / 10_000; // 0..1
      return { ad, key: -Math.log(1 - Math.min(0.999999, r)) / w };
    })
    .sort((a, b) => a.key - b.key)
    .map(x => x.ad);
}

/** Взвешенный случайный выбор одного объявления (для позиции в ленте). */
export function pickWeighted<T extends TargetableAd>(ads: T[], seed: string): T | null {
  if (ads.length === 0) return null;
  return weightedOrder(ads, seed)[0] || null;
}
