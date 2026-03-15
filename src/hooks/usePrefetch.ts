import { useCallback } from 'react';
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
};

// Prefetch functions
export const prefetchShops = async () => {
  const { data } = await supabase
    .from('shops')
    .select('*')
    .eq('is_active', true)
    .order('sort_order', { ascending: true });
  return data || [];
};

export const prefetchSubscriptions = async () => {
  const { data } = await supabase
    .from('subscription_types')
    .select('*')
    .eq('is_active', true)
    .order('sort_order', { ascending: true });
  return data || [];
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
