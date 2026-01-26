import { useState, useEffect } from 'react';
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
}

interface SubscriptionStatus {
  hasActiveSubscription: boolean;
  activeSubscriptions: ActiveSubscription[];
  daysRemaining: number | null;
  isExpiringSoon: boolean;
  isLoading: boolean;
}

export function useSubscriptionStatus() {
  const [status, setStatus] = useState<SubscriptionStatus>({
    hasActiveSubscription: false,
    activeSubscriptions: [],
    daysRemaining: null,
    isExpiringSoon: false,
    isLoading: true,
  });

  useEffect(() => {
    fetchSubscriptionStatus();
  }, []);

  const fetchSubscriptionStatus = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setStatus(prev => ({ ...prev, isLoading: false }));
        return;
      }

      // Fetch active subscriptions with type info
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
            cups_count
          )
        `)
        .eq('user_id', user.id)
        .eq('is_active', true);

      if (error) {
        console.error('Error fetching subscription status:', error);
        setStatus(prev => ({ ...prev, isLoading: false }));
        return;
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
      }));

      // Calculate days remaining for the soonest expiring subscription
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

      setStatus({
        hasActiveSubscription: activeSubscriptions.length > 0,
        activeSubscriptions,
        daysRemaining,
        isExpiringSoon,
        isLoading: false,
      });
    } catch (error) {
      console.error('Error in useSubscriptionStatus:', error);
      setStatus(prev => ({ ...prev, isLoading: false }));
    }
  };

  return {
    ...status,
    refetch: fetchSubscriptionStatus,
  };
}
