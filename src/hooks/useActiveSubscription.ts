import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { queryKeys } from '@/hooks/usePrefetch';

async function fetchActiveSubscription() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('user_subscriptions')
    .select('subscription_type_id')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .maybeSingle();

  if (error && error.code !== 'PGRST116') {
    console.error('Error fetching active subscription:', error);
  }

  return data?.subscription_type_id || null;
}

export function useActiveSubscription() {
  const { data: activeSubscriptionTypeId, isLoading, refetch } = useQuery({
    queryKey: queryKeys.activeSubscription,
    queryFn: fetchActiveSubscription,
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });

  return {
    activeSubscriptionTypeId: activeSubscriptionTypeId ?? null,
    isLoading,
    refetch
  };
}
