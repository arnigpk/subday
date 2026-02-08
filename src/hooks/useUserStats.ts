import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';

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
}

export interface UserProfile {
  name: string | null;
  phone: string;
  city: string | null;
  avatarUrl: string | null;
  subflowNickname: string | null;
}

export interface Redemption {
  id: string;
  shopName: string;
  shopId: string | null;
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
};

// Cache for user data to avoid redundant fetches
let cachedUserId: string | null = null;
let cachedProfile: UserProfile | null = null;
let cachedStats: UserStats | null = null;

export function useUserStats() {
  const [stats, setStats] = useState<UserStats>(cachedStats || defaultStats);
  const [profile, setProfile] = useState<UserProfile | null>(cachedProfile);
  const [redemptions, setRedemptions] = useState<Redemption[]>([]);
  const [isLoading, setIsLoading] = useState(!cachedStats);
  const [userId, setUserId] = useState<string | null>(cachedUserId);
  const queryClient = useQueryClient();

  const fetchData = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setIsLoading(false);
      return;
    }
    
    setUserId(user.id);
    cachedUserId = user.id;

    // Check for expired subscriptions (fire and forget)
    supabase.rpc('expire_subscriptions').then(() => {}, () => {});

    // Fetch profile and stats in parallel
    const [profileResult, statsResult, redemptionsResult] = await Promise.all([
      supabase
        .from('profiles')
        .select('name, phone, city, avatar_url, subflow_nickname')
        .eq('user_id', user.id)
        .maybeSingle(),
      supabase
        .from('user_stats')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle(),
      supabase
        .from('redemptions')
        .select('*')
        .eq('user_id', user.id)
        .order('redeemed_at', { ascending: false })
        .limit(50),
    ]);

    // Handle profile
    if (profileResult.data) {
      const newProfile = {
        name: profileResult.data.name,
        phone: profileResult.data.phone,
        city: profileResult.data.city,
        avatarUrl: profileResult.data.avatar_url,
        subflowNickname: profileResult.data.subflow_nickname,
      };
      setProfile(newProfile);
      cachedProfile = newProfile;
    }

    // Handle stats
    let statsData = statsResult.data;
    if (!statsData) {
      // Create default stats for new user
      const { data: newStats } = await supabase
        .from('user_stats')
        .insert({
          user_id: user.id,
          coffee_remaining: 0,
          coffee_total: 0,
          drinks_remaining: 0,
          drinks_total: 0,
          current_streak: 0,
          max_streak: 0,
          total_cups: 0,
          bonus_points: 0,
        })
        .select()
        .single();

      if (newStats) {
        statsData = newStats;
      }
    }

    if (statsData) {
      const newStats = {
        coffeeRemaining: statsData.coffee_remaining,
        coffeeTotal: statsData.coffee_total,
        drinksRemaining: statsData.drinks_remaining,
        drinksTotal: statsData.drinks_total,
        currentStreak: statsData.current_streak,
        maxStreak: statsData.max_streak,
        totalCups: statsData.total_cups,
        bonusPoints: statsData.bonus_points,
        lastRedemptionDate: statsData.last_redemption_date,
      };
      setStats(newStats);
      cachedStats = newStats;
    }

    // Handle redemptions
    if (redemptionsResult.data) {
      setRedemptions(
        redemptionsResult.data.map((r) => ({
          id: r.id,
          shopName: r.shop_name,
          shopId: r.shop_id,
          drinkName: r.drink_name,
          drinkType: r.drink_type as 'coffee' | 'drinks',
          redeemedAt: r.redeemed_at,
        }))
      );
    }

    setIsLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const redeemDrink = useCallback(async (
    shopName: string,
    shopId: string,
    drinkName: string,
    drinkType: 'coffee' | 'drinks'
  ): Promise<boolean> => {
    if (!userId) return false;

    const remaining = drinkType === 'coffee' ? stats.coffeeRemaining : stats.drinksRemaining;
    if (remaining <= 0) return false;

    const today = new Date().toISOString().split('T')[0];
    const isNewDay = stats.lastRedemptionDate !== today;
    
    let newStreak = stats.currentStreak;
    if (isNewDay) {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().split('T')[0];
      
      if (stats.lastRedemptionDate === yesterdayStr) {
        newStreak = stats.currentStreak + 1;
      } else if (!stats.lastRedemptionDate) {
        newStreak = 1;
      } else {
        newStreak = 1;
      }
    }

    const newMaxStreak = Math.max(newStreak, stats.maxStreak);
    const bonusForRedemption = 10;

    const newStatsData = {
      coffee_remaining: drinkType === 'coffee' ? stats.coffeeRemaining - 1 : stats.coffeeRemaining,
      drinks_remaining: drinkType === 'drinks' ? stats.drinksRemaining - 1 : stats.drinksRemaining,
      current_streak: newStreak,
      max_streak: newMaxStreak,
      total_cups: stats.totalCups + 1,
      bonus_points: stats.bonusPoints + bonusForRedemption,
      last_redemption_date: today,
    };

    const { error: statsError } = await supabase
      .from('user_stats')
      .update(newStatsData)
      .eq('user_id', userId);

    if (statsError) {
      console.error('Error updating stats:', statsError);
      return false;
    }

    const { error: redemptionError } = await supabase
      .from('redemptions')
      .insert({
        user_id: userId,
        shop_name: shopName,
        shop_id: shopId,
        drink_name: drinkName,
        drink_type: drinkType,
      });

    if (redemptionError) {
      console.error('Error inserting redemption:', redemptionError);
      return false;
    }

    // Update local state immediately
    const updatedStats = {
      ...stats,
      coffeeRemaining: newStatsData.coffee_remaining,
      drinksRemaining: newStatsData.drinks_remaining,
      currentStreak: newStreak,
      maxStreak: newMaxStreak,
      totalCups: stats.totalCups + 1,
      bonusPoints: stats.bonusPoints + bonusForRedemption,
      lastRedemptionDate: today,
    };
    setStats(updatedStats);
    cachedStats = updatedStats;

    // Invalidate related queries
    queryClient.invalidateQueries({ queryKey: ['subscriptionStatus'] });

    // Refresh data in background
    fetchData();

    return true;
  }, [userId, stats, fetchData, queryClient]);

  const updateAvatar = useCallback(async (avatarUrl: string): Promise<boolean> => {
    if (!userId) return false;

    const { error } = await supabase
      .from('profiles')
      .update({ avatar_url: avatarUrl })
      .eq('user_id', userId);

    if (error) {
      console.error('Error updating avatar:', error);
      return false;
    }

    const updatedProfile = profile ? { ...profile, avatarUrl } : null;
    setProfile(updatedProfile);
    cachedProfile = updatedProfile;
    return true;
  }, [userId, profile]);

  const refetch = useCallback(() => {
    setIsLoading(true);
    fetchData();
  }, [fetchData]);

  return useMemo(() => ({
    stats,
    profile,
    redemptions,
    isLoading,
    redeemDrink,
    updateAvatar,
    refetch,
  }), [stats, profile, redemptions, isLoading, redeemDrink, updateAvatar, refetch]);
}
