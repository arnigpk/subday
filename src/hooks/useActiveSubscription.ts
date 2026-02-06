import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface ActiveSubscription {
  id: string;
  subscription_type_id: string | null;
}

export function useActiveSubscription() {
  const [activeSubscriptionTypeId, setActiveSubscriptionTypeId] = useState<string | null>(null);
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
        .eq('is_active', true)
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error('Error fetching active subscription:', error);
      }

      setActiveSubscriptionTypeId(data?.subscription_type_id || null);
    } catch (error) {
      console.error('Error in useActiveSubscription:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return {
    activeSubscriptionTypeId,
    isLoading,
    refetch: fetchActiveSubscription
  };
}
