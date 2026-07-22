import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

type AudienceType = 'all' | 'subscribers' | 'no_subscription' | 'expiring_soon' | 'new_users' | 'inactive';

/**
 * Checks which audience types the current user belongs to.
 * Used for client-side filtering of banners and ads.
 */
export function useUserAudienceMatch() {
  const [matchedTypes, setMatchedTypes] = useState<Set<AudienceType>>(new Set(['all']));
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    checkAudience();
  }, []);

  const checkAudience = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setIsLoading(false);
        return;
      }

      const now = new Date();
      const fiveDaysLater = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000).toISOString();
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

      const [subsRes, profileRes, recentRedemptionRes] = await Promise.all([
        supabase.from('user_subscriptions').select('is_active, expires_at').eq('user_id', user.id).eq('is_active', true),
        supabase.from('profiles').select('created_at').eq('user_id', user.id).single(),
        supabase.from('redemptions').select('id').eq('user_id', user.id).gte('redeemed_at', thirtyDaysAgo).limit(1),
      ]);

      const types = new Set<AudienceType>(['all']);
      const activeSubs = subsRes.data || [];
      const hasActiveSub = activeSubs.length > 0;

      if (hasActiveSub) {
        types.add('subscribers');
        // Check expiring soon
        const expiringOne = activeSubs.find(s => 
          s.expires_at && new Date(s.expires_at) <= new Date(fiveDaysLater) && new Date(s.expires_at) >= now
        );
        if (expiringOne) types.add('expiring_soon');
      } else {
        types.add('no_subscription');
      }

      // New user check
      if (profileRes.data?.created_at && new Date(profileRes.data.created_at) >= new Date(sevenDaysAgo)) {
        types.add('new_users');
      }

      // Inactive check: no active sub AND no recent redemptions
      if (!hasActiveSub && (!recentRedemptionRes.data || recentRedemptionRes.data.length === 0)) {
        types.add('inactive');
      }

      setMatchedTypes(types);
    } catch (err) {
      console.error('Error checking audience:', err);
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Returns true if the user matches ANY of the given audience types.
   * If audienceTypes contains 'all' or is empty, always returns true.
   */
  // ВАЖНО: мемоизируем по matchedTypes. Без useCallback функция была новой на
  // каждый рендер — из-за этого в ленте пересчитывался список реклам и эффект
  // лимитов гонялся без конца: реклама показывалась, через ~1 сек её показ
  // засчитывался, и следующий прогон убирал её (дневной лимит) — реклама
  // «исчезала на глазах». Со стабильной ссылкой прогон идёт один раз.
  const matchesAudience = useCallback((audienceTypes: string[] | null | undefined): boolean => {
    if (!audienceTypes || audienceTypes.length === 0 || audienceTypes.includes('all')) return true;
    return audienceTypes.some(t => matchedTypes.has(t as AudienceType));
  }, [matchedTypes]);

  return { matchedTypes, matchesAudience, isLoading };
}
