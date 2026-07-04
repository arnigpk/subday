import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

// Кеш активных подписок — чтобы на странице «Подписки» активная сразу была
// помечена активной (а не «Оформить → потом активна»). Фоновый fetch обновит.
const ACTIVE_SUBS_CACHE_KEY = 'subday_active_subs_cache';
function readActiveSubsCache(): string[] | null {
  try {
    const raw = localStorage.getItem(ACTIVE_SUBS_CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function useActiveSubscription() {
  const [activeSubscriptionTypeIds, setActiveSubscriptionTypeIds] = useState<string[]>(() => readActiveSubsCache() ?? []);
  const [isLoading, setIsLoading] = useState(() => readActiveSubsCache() === null);

  useEffect(() => {
    fetchActiveSubscription();
  }, []);

  const fetchActiveSubscription = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        try { localStorage.removeItem(ACTIVE_SUBS_CACHE_KEY); } catch { /* ignore */ }
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

      const ids = (data || []).map(s => s.subscription_type_id).filter(Boolean) as string[];
      setActiveSubscriptionTypeIds(ids);
      try { localStorage.setItem(ACTIVE_SUBS_CACHE_KEY, JSON.stringify(ids)); } catch { /* ignore */ }
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
