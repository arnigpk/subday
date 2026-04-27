import { createContext, useContext, ReactNode } from 'react';
import { useUserStats, UserStats, UserProfile, Redemption } from '@/hooks/useUserStats';

interface UserStatsContextType {
  stats: UserStats;
  profile: UserProfile | null;
  redemptions: Redemption[];
  completedPreordersCount: number;
  isLoading: boolean;
  redeemDrink: (shopName: string, shopId: string, drinkName: string, drinkType: 'coffee' | 'drinks') => Promise<boolean>;
  updateAvatar: (avatarUrl: string | null) => Promise<boolean>;
  refetch: () => void;
}

const UserStatsContext = createContext<UserStatsContextType | undefined>(undefined);

export function UserStatsProvider({ children }: { children: ReactNode }) {
  const userStats = useUserStats();

  return (
    <UserStatsContext.Provider value={userStats}>
      {children}
    </UserStatsContext.Provider>
  );
}

export function useUserStatsContext() {
  const context = useContext(UserStatsContext);
  if (context === undefined) {
    throw new Error('useUserStatsContext must be used within a UserStatsProvider');
  }
  return context;
}
