import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface UserStats {
  coffeeRemaining: number;
  coffeeTotal: number;
  drinksRemaining: number;
  drinksTotal: number;
  currentStreak: number;
  maxStreak: number;
  totalCups: number;
  bonusPoints: number;
  lastRedemptionDate: string | null;
  guestCoffees: number;
  guestExpiresAt: string | null;
}

export interface UserProfile {
  name: string | null;
  phone: string;
  city: string | null;
  country: string | null;
  avatarUrl: string | null;
  subflowNickname: string | null;
  publicId: string | null;
}

export interface Redemption {
  id: string;
  shopName: string;
  shopId: string | null;
  shopAddress: string | null;
  drinkName: string;
  drinkType: 'coffee' | 'drinks';
  redeemedAt: string;
}

const defaultStats: UserStats = {
  coffeeRemaining: 0,
  coffeeTotal: 0,
  drinksRemaining: 0,
  drinksTotal: 0,
  currentStreak: 0,
  maxStreak: 0,
  totalCups: 0,
  bonusPoints: 0,
  lastRedemptionDate: null,
  guestCoffees: 0,
  guestExpiresAt: null,
};

export function useUserStats() {
  const [stats, setStats] = useState<UserStats>(defaultStats);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [redemptions, setRedemptions] = useState<Redemption[]>([]);
  const [completedPreordersCount, setCompletedPreordersCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setIsLoading(false); return; }
    setUserId(user.id);

    // Fetch profile, stats, redemptions, and completed preorders in parallel
    const [profileResult, statsResult, redemptionsResult, preordersCountResult] = await Promise.all([
      supabase.from('profiles').select('name, phone, city, country, avatar_url, subflow_nickname, public_id').eq('user_id', user.id).maybeSingle(),
      supabase.from('user_stats').select('*').eq('user_id', user.id).maybeSingle(),
      supabase.from('redemptions').select('*').eq('user_id', user.id).order('redeemed_at', { ascending: false }).limit(50),
      supabase.from('preorders').select('id', { count: 'exact', head: true }).eq('user_id', user.id).eq('status', 'completed'),
    ]);

    setCompletedPreordersCount(preordersCountResult.count ?? 0);

    if (profileResult.data) {
      setProfile({
        name: profileResult.data.name,
        phone: profileResult.data.phone,
        city: profileResult.data.city,
        country: profileResult.data.country,
        avatarUrl: profileResult.data.avatar_url,
        subflowNickname: profileResult.data.subflow_nickname,
        publicId: (profileResult.data as any).public_id || null,
      });
    }

    let statsData = statsResult.data;
    if (!statsData) {
      // user_stats мутации запрещены клиенту RLS — используем SECURITY DEFINER функцию
      await supabase.rpc('ensure_user_stats', { _user_id: user.id });
      const { data: refetched } = await supabase
        .from('user_stats').select('*').eq('user_id', user.id).maybeSingle();
      if (refetched) statsData = refetched;
    }

    if (statsData) {
      setStats({
        coffeeRemaining: statsData.coffee_remaining,
        coffeeTotal: statsData.coffee_total,
        drinksRemaining: statsData.drinks_remaining,
        drinksTotal: statsData.drinks_total,
        currentStreak: statsData.current_streak,
        maxStreak: statsData.max_streak,
        totalCups: statsData.total_cups,
        bonusPoints: statsData.bonus_points,
        lastRedemptionDate: statsData.last_redemption_date,
        guestCoffees: statsData.guest_coffees ?? 0,
        guestExpiresAt: statsData.guest_expires_at ?? null,
      });
    }

    if (redemptionsResult.data) {
      setRedemptions(
        redemptionsResult.data.map((r) => ({
          id: r.id, shopName: r.shop_name, shopId: r.shop_id,
          shopAddress: (r as any).shop_address || null,
          drinkName: r.drink_name, drinkType: r.drink_type as 'coffee' | 'drinks',
          redeemedAt: r.redeemed_at,
        }))
      );
    }

    setIsLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // DEPRECATED: клиентское списание отключено по соображениям безопасности.
  // Все списания проходят через edge function partner-scan-qr (service role).
  const redeemDrink = async (
    _shopName: string,
    _shopId: string,
    _drinkName: string,
    _drinkType: 'coffee' | 'drinks'
  ): Promise<boolean> => {
    console.warn('[useUserStats] redeemDrink deprecated — use partner-scan-qr edge function');
    return false;
  };

  const updateAvatar = async (avatarUrl: string | null): Promise<boolean> => {
    if (!userId) return false;

    const { error } = await supabase
      .from('profiles')
      .update({ avatar_url: avatarUrl })
      .eq('user_id', userId);

    if (error) {
      console.error('Error updating avatar:', error);
      return false;
    }

    setProfile((prev) => prev ? { ...prev, avatarUrl } : null);
    return true;
  };

  const refetch = () => {
    setIsLoading(true);
    fetchData();
  };

  return {
    stats,
    profile,
    redemptions,
    isLoading,
    redeemDrink,
    updateAvatar,
    refetch,
  };
}
