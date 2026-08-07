import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { setCache, getCache, CACHE_KEYS, CACHE_TTL } from '@/utils/offlineCache';

// Query keys for consistent caching
export const queryKeys = {
  shops: ['shops'] as const,
  subscriptions: ['subscriptions'] as const,
  userStats: ['userStats'] as const,
  profile: ['profile'] as const,
  subflowPosts: ['subflowPosts'] as const,
  redemptions: ['redemptions'] as const,
  activeSubscription: ['activeSubscription'] as const,
};

// Prefetch functions
export const prefetchShops = async () => {
  try {
    const { data, error } = await supabase
      .from('shops')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });
    if (error) throw error;
    const list = data || [];
    // Кешируем для оффлайн-показа «Кофейни рядом» / страницы «Кофейни»
    setCache(CACHE_KEYS.shops, list, CACHE_TTL.shops);
    return list;
  } catch (err) {
    // Сеть упала — отдаём кеш, если он есть (даже устаревший — лучше, чем пустой экран)
    const cached = getCache<any[]>(CACHE_KEYS.shops);
    if (cached?.data) return cached.data;
    throw err;
  }
};

export const prefetchSubscriptions = async () => {
  try {
    const { data, error } = await supabase
      .from('subscription_types')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });
    if (error) throw error;
    const list = data || [];
    // Кешируем для мгновенного показа страницы подписок при переоткрытии.
    setCache(CACHE_KEYS.subscriptions, list, CACHE_TTL.subscriptions);
    return list;
  } catch (err) {
    const cached = getCache<any[]>(CACHE_KEYS.subscriptions);
    if (cached?.data) return cached.data;
    throw err;
  }
};

/**
 * Прогрев одноразового кода для QR при запуске приложения: к моменту, когда
 * пользователь нажмёт «Показать QR», код уже лежит в кеше — QR рисуется сразу
 * и не перерисовывается (без мерцания). Кладём в тот же снимок qrSnapshot,
 * откуда RedeemPage читает его синхронно.
 */
export const prefetchQrNonce = async () => {
  try {
    const { data } = await supabase.rpc('get_user_qr_nonce' as never);
    const r = data as unknown as { ok?: boolean; nonce?: string } | null;
    if (!r?.ok || !r.nonce) return;
    const prev = getCache<{ userId?: string; payload?: Record<string, unknown> }>(CACHE_KEYS.qrSnapshot);
    const payload = { ...(prev?.data?.payload || {}), n: r.nonce };
    setCache(CACHE_KEYS.qrSnapshot, { ...(prev?.data || {}), payload }, CACHE_TTL.qrSnapshot);
  } catch { /* нет сети/сессии — не критично, QR возьмёт код из кеша */ }
};

export const prefetchSubflowPosts = async () => {
  const { data } = await supabase
    .from('subflow_posts')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(20);
  return data || [];
};

export function usePrefetch() {
  const queryClient = useQueryClient();

  const prefetchPage = useCallback(
    (page: 'shops' | 'packages' | 'subflow' | 'profile' | 'home') => {
      switch (page) {
        case 'shops':
          queryClient.prefetchQuery({
            queryKey: queryKeys.shops,
            queryFn: prefetchShops,
            staleTime: 5 * 60 * 1000,
          });
          break;
        case 'packages':
          queryClient.prefetchQuery({
            queryKey: queryKeys.subscriptions,
            queryFn: prefetchSubscriptions,
            staleTime: 5 * 60 * 1000,
          });
          break;
        case 'subflow':
          queryClient.prefetchQuery({
            queryKey: queryKeys.subflowPosts,
            queryFn: prefetchSubflowPosts,
            staleTime: 30 * 1000,
          });
          break;
        case 'home':
        case 'profile':
          // These use the UserStatsContext which is already loaded
          break;
      }
    },
    [queryClient]
  );

  const prefetchAll = useCallback(() => {
    // Код для QR греем сразу при старте — чтобы «Показать QR» открывался готовым.
    prefetchQrNonce();
    // Prefetch all main pages data in parallel
    Promise.all([
      queryClient.prefetchQuery({
        queryKey: queryKeys.shops,
        queryFn: prefetchShops,
        staleTime: 5 * 60 * 1000,
      }),
      queryClient.prefetchQuery({
        queryKey: queryKeys.subscriptions,
        queryFn: prefetchSubscriptions,
        staleTime: 5 * 60 * 1000,
      }),
    ]);
  }, [queryClient]);

  return { prefetchPage, prefetchAll };
}
