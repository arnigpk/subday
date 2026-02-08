import { useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

// Query keys for consistent caching
export const queryKeys = {
  shops: ['shops'] as const,
  subscriptions: ['subscriptions'] as const,
  userStats: ['userStats'] as const,
  profile: ['profile'] as const,
  subflowPosts: ['subflowPosts'] as const,
  redemptions: ['redemptions'] as const,
  activeSubscription: ['activeSubscription'] as const,
  adBanners: ['adBanners'] as const,
  shopVisits: ['shopVisits'] as const,
};

// Prefetch functions with optimized queries
export const prefetchShops = async () => {
  const { data } = await supabase
    .from('shops')
    .select('id, name, address, addresses, city, working_hours, is_active, logo_url, gallery_urls, badge_text, badge_color, badges, coordinates, sort_order')
    .eq('is_active', true)
    .order('sort_order', { ascending: true });
  return data || [];
};

export const prefetchSubscriptions = async () => {
  const { data } = await supabase
    .from('subscription_types')
    .select('id, name, description, type, cups_count, price, duration_days, is_active, badge, badge_color, benefit, sort_order')
    .eq('is_active', true)
    .order('sort_order', { ascending: true });
  return data || [];
};

export const prefetchSubflowPosts = async () => {
  const { data } = await supabase
    .from('subflow_posts')
    .select('id, user_id, content, image_url, image_urls, shop_id, shop_name, created_at')
    .order('created_at', { ascending: false })
    .limit(20);
  return data || [];
};

export const prefetchAdBanners = async () => {
  const { data } = await supabase
    .from('ad_banners')
    .select('id, image_url, caption, external_url, shop_id, autoplay_delay, sort_order')
    .eq('is_active', true)
    .order('sort_order', { ascending: true });
  return data || [];
};

export function usePrefetch() {
  const queryClient = useQueryClient();
  const prefetchedRef = useRef<Set<string>>(new Set());

  const prefetchPage = useCallback(
    (page: 'shops' | 'packages' | 'subflow' | 'profile' | 'home') => {
      // Prevent duplicate prefetching within same session
      if (prefetchedRef.current.has(page)) {
        return;
      }
      
      prefetchedRef.current.add(page);
      
      switch (page) {
        case 'shops':
          queryClient.prefetchQuery({
            queryKey: queryKeys.shops,
            queryFn: prefetchShops,
            staleTime: 60 * 1000,
          });
          // Also prefetch banners for shops page
          queryClient.prefetchQuery({
            queryKey: queryKeys.adBanners,
            queryFn: prefetchAdBanners,
            staleTime: 2 * 60 * 1000,
          });
          break;
        case 'packages':
          queryClient.prefetchQuery({
            queryKey: queryKeys.subscriptions,
            queryFn: prefetchSubscriptions,
            staleTime: 2 * 60 * 1000,
          });
          break;
        case 'subflow':
          queryClient.prefetchQuery({
            queryKey: queryKeys.subflowPosts,
            queryFn: prefetchSubflowPosts,
            staleTime: 30 * 1000, // Fresher data for social feed
          });
          break;
        case 'home':
          // Prefetch shops for carousel and banners
          queryClient.prefetchQuery({
            queryKey: queryKeys.shops,
            queryFn: prefetchShops,
            staleTime: 60 * 1000,
          });
          break;
        case 'profile':
          // Profile uses UserStatsContext which is already loaded
          break;
      }
    },
    [queryClient]
  );

  const prefetchAll = useCallback(() => {
    // Prefetch all main pages data in parallel
    Promise.all([
      queryClient.prefetchQuery({
        queryKey: queryKeys.shops,
        queryFn: prefetchShops,
        staleTime: 60 * 1000,
      }),
      queryClient.prefetchQuery({
        queryKey: queryKeys.subscriptions,
        queryFn: prefetchSubscriptions,
        staleTime: 2 * 60 * 1000,
      }),
      queryClient.prefetchQuery({
        queryKey: queryKeys.adBanners,
        queryFn: prefetchAdBanners,
        staleTime: 2 * 60 * 1000,
      }),
    ]);
  }, [queryClient]);

  // Reset prefetch cache (useful for testing or forced refresh)
  const resetPrefetchCache = useCallback(() => {
    prefetchedRef.current.clear();
  }, []);

  return { prefetchPage, prefetchAll, resetPrefetchCache };
}
