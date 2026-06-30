import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface ActiveSubscription {
  id: string;
  subscription_type_id: string | null;
  started_at: string | null;
  expires_at: string | null;
  is_active: boolean | null;
  is_frozen?: boolean | null;
  freeze_until?: string | null;
  freeze_used?: boolean | null;
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
  isLoading: boolean;
}

// Module-level cache for instant access across components
let cachedStatus: SubscriptionStatus | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 60000; // 1 minute

export function useSubscriptionStatus() {
  const [status, setStatus] = useState<SubscriptionStatus>(() => {
    // Return cached data instantly if available
    if (cachedStatus && Date.now() - cacheTimestamp < CACHE_TTL) {
      return cachedStatus;
    }
    return {
      hasActiveSubscription: false,
      activeSubscriptions: [],
      daysRemaining: null,
      isExpiringSoon: false,
      isLoading: true,
    };
  });
  
  const fetchedRef = useRef(false);

  const fetchSubscriptionStatus = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        const result = { ...status, isLoading: false };
        setStatus(result);
        return;
      }

      // Check subscriptions and subflow_access in parallel
      const [subsResult, profileResult] = await Promise.all([
        supabase
          .from('user_subscriptions')
          .select(`
            id, subscription_type_id, started_at, expires_at, is_active, is_frozen, freeze_until, freeze_used,
            subscription_types (name, type, cups_count, duration_days, features)
          `)
          .eq('user_id', user.id)
          .eq('is_active', true)
          .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`),
        supabase
          .from('profiles')
          .select('subflow_access')
          .eq('user_id', user.id)
          .single(),
      ]);

      const { data: subscriptions, error } = subsResult;
      const hasSubflowAccess = (profileResult.data as any)?.subflow_access === true;

      if (error) {
        setStatus(prev => ({ ...prev, isLoading: false }));
        return;
      }

      const activeSubscriptions: ActiveSubscription[] = (subscriptions || []).map(sub => ({
        id: sub.id,
        subscription_type_id: sub.subscription_type_id,
        started_at: sub.started_at,
        expires_at: sub.expires_at,
        is_active: sub.is_active,
        is_frozen: (sub as any).is_frozen,
        freeze_until: (sub as any).freeze_until,
        freeze_used: (sub as any).freeze_used,
        subscription_name: (sub.subscription_types as any)?.name,
        subscription_type: (sub.subscription_types as any)?.type,
        cups_count: (sub.subscription_types as any)?.cups_count,
        duration_days: (sub.subscription_types as any)?.duration_days,
        features: (sub.subscription_types as any)?.features,
      }));

      let daysRemaining: number | null = null;
      let isExpiringSoon = false;

      if (activeSubscriptions.length > 0) {
        const soonestExpiry = activeSubscriptions
          .filter(s => s.expires_at)
          .sort((a, b) => new Date(a.expires_at!).getTime() - new Date(b.expires_at!).getTime())[0];

        if (soonestExpiry?.expires_at) {
          const diffTime = new Date(soonestExpiry.expires_at).getTime() - Date.now();
          daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
          isExpiringSoon = daysRemaining <= 7 && daysRemaining > 0;
        }
      }

      const newStatus: SubscriptionStatus = {
        hasActiveSubscription: activeSubscriptions.length > 0 || hasSubflowAccess,
        activeSubscriptions,
        daysRemaining,
        isExpiringSoon,
        isLoading: false,
      };

      // Update module-level cache
      cachedStatus = newStatus;
      cacheTimestamp = Date.now();
      
      setStatus(newStatus);
    } catch (error) {
      console.error('Error in useSubscriptionStatus:', error);
      setStatus(prev => ({ ...prev, isLoading: false }));
    }
  }, []);

  useEffect(() => {
    // Skip fetch if we have fresh cache
    if (cachedStatus && Date.now() - cacheTimestamp < CACHE_TTL && !fetchedRef.current) {
      fetchedRef.current = true;
      // Still refresh in background
      fetchSubscriptionStatus();
      return;
    }
    fetchSubscriptionStatus();
  }, [fetchSubscriptionStatus]);

  return {
    ...status,
    refetch: fetchSubscriptionStatus,
  };
}
