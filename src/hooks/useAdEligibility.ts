import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { startOfAdsDay, type ShopAffinity } from '@/lib/adTargeting';

export type AdKind = 'subflow' | 'banner';

export interface UserAdStat { todayViews: number; lastViewAt: Date | null }

/** Общий потолок показов рекламы на пользователя, поверх лимитов объявлений. */
export interface AdsCaps { maxPerDay: number; maxPerSession: number }

/**
 * Счётчик показов за сессию — ОДИН на всё приложение, а не на каждый вызов хука.
 * Иначе баннеры и лента считали бы отдельно, и «не больше N за сессию»
 * превращалось бы в N в каждом месте.
 */
const sessionShown = { count: 0 };

/**
 * Персональные данные для правил показа рекламы:
 *  • тарифы пользователя (для таргета на подписку);
 *  • сколько раз он видел объявление СЕГОДНЯ (дневной лимит);
 *  • когда видел последний раз (частотный кап).
 * Работает и для баннеров, и для SubFlow (разные таблицы событий).
 */
export function useAdEligibility(kind: AdKind) {
  const [userId, setUserId] = useState<string | null>(null);
  const [userSubTypeIds, setUserSubTypeIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [affinity, setAffinity] = useState<ShopAffinity | null>(null);
  const [caps, setCaps] = useState<AdsCaps>({ maxPerDay: 0, maxPerSession: 0 });
  const statsCache = useRef<Map<string, UserAdStat>>(new Map());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (cancelled) return;
      setUserId(user?.id || null);

      const capsPromise = supabase
        .from('ads_settings')
        .select('max_ads_per_day, max_ads_per_session')
        .maybeSingle();

      if (user) {
        const [subsRes, redRes, capsRes] = await Promise.all([
          supabase.from('user_subscriptions')
            .select('subscription_type_id')
            .eq('user_id', user.id)
            .eq('is_active', true),
          // История посещений — основа поведенческого таргета.
          supabase.from('redemptions')
            .select('shop_id, redeemed_at')
            .eq('user_id', user.id)
            .not('shop_id', 'is', null)
            .order('redeemed_at', { ascending: false })
            .limit(1000),
          capsPromise,
        ]);
        if (cancelled) return;

        setUserSubTypeIds(((subsRes.data || []).map(r => r.subscription_type_id).filter(Boolean)) as string[]);

        const lastVisitByShop = new Map<string, Date>();
        for (const r of (redRes.data || []) as { shop_id: string; redeemed_at: string }[]) {
          if (!r.shop_id || lastVisitByShop.has(r.shop_id)) continue; // отсортировано по убыванию
          lastVisitByShop.set(r.shop_id, new Date(r.redeemed_at));
        }
        setAffinity({ lastVisitByShop });
        if (capsRes.data) {
          setCaps({
            maxPerDay: capsRes.data.max_ads_per_day || 0,
            maxPerSession: capsRes.data.max_ads_per_session || 0,
          });
        }
      } else {
        const capsRes = await capsPromise;
        if (cancelled) return;
        if (capsRes.data) {
          setCaps({
            maxPerDay: capsRes.data.max_ads_per_day || 0,
            maxPerSession: capsRes.data.max_ads_per_session || 0,
          });
        }
      }
      if (!cancelled) setIsLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  /** Показы за сегодня + время последнего показа по каждому объявлению из списка. */
  const loadStats = useCallback(async (adIds: string[]): Promise<Map<string, UserAdStat>> => {
    const result = new Map<string, UserAdStat>();
    if (!userId || adIds.length === 0) return result;

    const table = kind === 'subflow' ? 'subflow_ad_events' : 'ad_banner_events';
    const idCol = kind === 'subflow' ? 'ad_id' : 'banner_id';
    const dayStart = startOfAdsDay().toISOString();

    // Показы за сегодня (для дневного лимита).
    const { data: todayRows } = await supabase
      .from(table)
      .select(idCol)
      .eq('user_id', userId)
      .eq('event_type', 'view')
      .gte('created_at', dayStart)
      .in(idCol, adIds);

    // Последний показ (для частотного капа) — берём свежие события без ограничения по дню.
    const { data: lastRows } = await supabase
      .from(table)
      .select(`${idCol}, created_at`)
      .eq('user_id', userId)
      .eq('event_type', 'view')
      .in(idCol, adIds)
      .order('created_at', { ascending: false })
      .limit(500);

    for (const id of adIds) result.set(id, { todayViews: 0, lastViewAt: null });
    for (const r of (todayRows || []) as Record<string, string>[]) {
      const id = r[idCol];
      const cur = result.get(id); if (cur) cur.todayViews += 1;
    }
    for (const r of (lastRows || []) as Record<string, string>[]) {
      const id = r[idCol];
      const cur = result.get(id);
      if (cur && !cur.lastViewAt) cur.lastViewAt = new Date(r.created_at);
    }

    statsCache.current = result;
    return result;
  }, [userId, kind]);

  /**
   * Общий потолок: сколько всего реклам этого типа человек уже видел сегодня.
   * Работает поверх лимитов отдельных объявлений — чтобы пять разных кампаний
   * не выдали пять реклам подряд «по правилам».
   */
  const loadTotalToday = useCallback(async (): Promise<number> => {
    if (!userId || caps.maxPerDay <= 0) return 0;
    const dayStart = startOfAdsDay().toISOString();
    // Считаем ОБА типа рекламы: потолок общий на человека, а не отдельный
    // для баннеров и отдельный для ленты.
    const count = async (table: 'subflow_ad_events' | 'ad_banner_events') => {
      const { count: c } = await supabase
        .from(table)
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('event_type', 'view')
        .gte('created_at', dayStart);
      return c || 0;
    };
    const [subflow, banner] = await Promise.all([count('subflow_ad_events'), count('ad_banner_events')]);
    return subflow + banner;
  }, [userId, caps.maxPerDay]);

  /** Исчерпан ли общий потолок (за день или за текущую сессию). */
  const capExhausted = useCallback((totalToday: number): boolean => {
    if (caps.maxPerSession > 0 && sessionShown.count >= caps.maxPerSession) return true;
    if (caps.maxPerDay > 0 && totalToday + sessionShown.count >= caps.maxPerDay) return true;
    return false;
  }, [caps]);

  /** Локально учесть показ, который только что произошёл (чтобы лимит сработал сразу). */
  const noteView = useCallback((adId: string) => {
    const cur = statsCache.current.get(adId) || { todayViews: 0, lastViewAt: null };
    statsCache.current.set(adId, { todayViews: cur.todayViews + 1, lastViewAt: new Date() });
    sessionShown.count += 1;
  }, []);

  return {
    userId, userSubTypeIds, isLoading, affinity, caps,
    loadStats, loadTotalToday, capExhausted, noteView, statsCache,
  };
}
