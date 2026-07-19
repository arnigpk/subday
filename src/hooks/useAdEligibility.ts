import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { startOfAdsDay } from '@/lib/adTargeting';

export type AdKind = 'subflow' | 'banner';

export interface UserAdStat { todayViews: number; lastViewAt: Date | null }

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
  const statsCache = useRef<Map<string, UserAdStat>>(new Map());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (cancelled) return;
      setUserId(user?.id || null);
      if (user) {
        const { data } = await supabase
          .from('user_subscriptions')
          .select('subscription_type_id')
          .eq('user_id', user.id)
          .eq('is_active', true);
        if (!cancelled) {
          setUserSubTypeIds(((data || []).map(r => r.subscription_type_id).filter(Boolean)) as string[]);
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

  /** Локально учесть показ, который только что произошёл (чтобы лимит сработал сразу). */
  const noteView = useCallback((adId: string) => {
    const cur = statsCache.current.get(adId) || { todayViews: 0, lastViewAt: null };
    statsCache.current.set(adId, { todayViews: cur.todayViews + 1, lastViewAt: new Date() });
  }, []);

  return { userId, userSubTypeIds, isLoading, loadStats, noteView, statsCache };
}
