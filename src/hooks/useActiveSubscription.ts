import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export function useActiveSubscription() {
  const [activeSubscriptionTypeIds, setActiveSubscriptionTypeIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchActiveSubscription();
  }, []);

  const fetchActiveSubscription = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setIsLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from('user_subscriptions')
        .select('subscription_type_id')
        .eq('user_id', user.id)
        .eq('is_active', true);

      if (error) {
        console.error('Error fetching active subscription:', error);
      }

      setActiveSubscriptionTypeIds(
        (data || []).map(s => s.subscription_type_id).filter(Boolean) as string[]
      );
    } catch (error) {
      console.error('Error in useActiveSubscription:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Keep backward compat
  const activeSubscriptionTypeId = activeSubscriptionTypeIds[0] || null;

  return {
    activeSubscriptionTypeId,
    activeSubscriptionTypeIds,
    isLoading,
    refetch: fetchActiveSubscription
  };
}
