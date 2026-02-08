import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface ActiveSubscription {
  id: string;
  subscription_type_id: string | null;
  started_at: string | null;
  expires_at: string | null;
  is_active: boolean | null;
  subscription_name?: string;
  subscription_type?: string;
  cups_count?: number;
  duration_days?: number;
  features?: string[];
}

interface SubscriptionStatus {
  hasActiveSubscription: boolean;
  activeSubscriptions: ActiveSubscription[];
  daysRemaining: number | null;
  isExpiringSoon: boolean;
}

async function fetchSubscriptionStatus(): Promise<SubscriptionStatus> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return {
      hasActiveSubscription: false,
      activeSubscriptions: [],
      daysRemaining: null,
      isExpiringSoon: false,
    };
  }

  const { data: subscriptions, error } = await supabase
    .from('user_subscriptions')
    .select(`
      id,
      subscription_type_id,
      started_at,
      expires_at,
      is_active,
      subscription_types (
        name,
        type,
        cups_count,
        duration_days,
        features
      )
    `)
    .eq('user_id', user.id)
    .eq('is_active', true);

  if (error) {
    console.error('Error fetching subscription status:', error);
    return {
      hasActiveSubscription: false,
      activeSubscriptions: [],
      daysRemaining: null,
      isExpiringSoon: false,
    };
  }

  const activeSubscriptions: ActiveSubscription[] = (subscriptions || []).map(sub => ({
    id: sub.id,
    subscription_type_id: sub.subscription_type_id,
    started_at: sub.started_at,
    expires_at: sub.expires_at,
    is_active: sub.is_active,
    subscription_name: (sub.subscription_types as { name: string } | null)?.name,
    subscription_type: (sub.subscription_types as { type: string } | null)?.type,
    cups_count: (sub.subscription_types as { cups_count: number } | null)?.cups_count,
    duration_days: (sub.subscription_types as { duration_days: number } | null)?.duration_days,
    features: (sub.subscription_types as { features: string[] } | null)?.features,
  }));

  // Calculate days remaining
  let daysRemaining: number | null = null;
  let isExpiringSoon = false;

  if (activeSubscriptions.length > 0) {
    const soonestExpiry = activeSubscriptions
      .filter(s => s.expires_at)
      .sort((a, b) => new Date(a.expires_at!).getTime() - new Date(b.expires_at!).getTime())[0];

    if (soonestExpiry?.expires_at) {
      const expiryDate = new Date(soonestExpiry.expires_at);
      const now = new Date();
      const diffTime = expiryDate.getTime() - now.getTime();
      daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      isExpiringSoon = daysRemaining <= 7 && daysRemaining > 0;
    }
  }

  return {
    hasActiveSubscription: activeSubscriptions.length > 0,
    activeSubscriptions,
    daysRemaining,
    isExpiringSoon,
  };
}

export function useSubscriptionStatus() {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['subscriptionStatus'],
    queryFn: fetchSubscriptionStatus,
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });

  return {
    hasActiveSubscription: data?.hasActiveSubscription ?? false,
    activeSubscriptions: data?.activeSubscriptions ?? [],
    daysRemaining: data?.daysRemaining ?? null,
    isExpiringSoon: data?.isExpiringSoon ?? false,
    isLoading,
    refetch,
  };
}
