import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface DailyLimitStatus {
  dailyLimit: number | null; // null = unlimited
  usedToday: number;
  remainingToday: number | null; // null = unlimited
  isLimitReached: boolean;
  isLoading: boolean;
}

export function useDailyLimit(subscriptionType: 'coffee' | 'drinks' = 'coffee') {
  const [status, setStatus] = useState<DailyLimitStatus>({
    dailyLimit: null,
    usedToday: 0,
    remainingToday: null,
    isLimitReached: false,
    isLoading: true,
  });

  const fetchDailyLimitStatus = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setStatus(prev => ({ ...prev, isLoading: false }));
        return;
      }

      // Get active subscriptions with daily_limit info
      const { data: subscriptions, error: subError } = await supabase
        .from('user_subscriptions')
        .select(`
          id,
          subscription_types (
            daily_limit,
            type
          )
        `)
        .eq('user_id', user.id)
        .eq('is_active', true);

      if (subError) {
        console.error('Error fetching subscription:', subError);
        setStatus(prev => ({ ...prev, isLoading: false }));
        return;
      }

      // Find subscription matching the requested type
      const subscription = (subscriptions || []).find(sub => {
        const st = sub.subscription_types as { daily_limit: number | null; type: string } | null;
        return st?.type === subscriptionType;
      });

      const subTypes = subscription?.subscription_types as { daily_limit: number | null; type: string } | null;

      if (!subscription || !subTypes) {
        setStatus({
          dailyLimit: null,
          usedToday: 0,
          remainingToday: null,
          isLimitReached: false,
          isLoading: false,
        });
        return;
      }

      const dailyLimit = subTypes.daily_limit;

      // Unlimited
      if (dailyLimit === null) {
        setStatus({
          dailyLimit: null,
          usedToday: 0,
          remainingToday: null,
          isLimitReached: false,
          isLoading: false,
        });
        return;
      }

      // Count today's redemptions
      const today = new Date().toISOString().split('T')[0];
      const { count, error: countError } = await supabase
        .from('redemptions')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('drink_type', subscriptionType)
        .gte('redeemed_at', `${today}T00:00:00`)
        .lt('redeemed_at', `${today}T23:59:59.999`);

      if (countError) {
        console.error('Error counting redemptions:', countError);
        setStatus(prev => ({ ...prev, isLoading: false }));
        return;
      }

      const usedToday = count || 0;
      const remainingToday = Math.max(0, dailyLimit - usedToday);
      const isLimitReached = remainingToday <= 0;

      setStatus({
        dailyLimit,
        usedToday,
        remainingToday,
        isLimitReached,
        isLoading: false,
      });
    } catch (error) {
      console.error('Error in useDailyLimit:', error);
      setStatus(prev => ({ ...prev, isLoading: false }));
    }
  }, [subscriptionType]);

  useEffect(() => {
    fetchDailyLimitStatus();
  }, [fetchDailyLimitStatus]);

  return {
    ...status,
    refetch: fetchDailyLimitStatus,
  };
}
