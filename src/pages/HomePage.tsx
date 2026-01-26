import { AppLayout } from '@/components/layout/AppLayout';
import { BalanceCard } from '@/components/home/BalanceCard';
import { GetCoffeeButton } from '@/components/home/GetCoffeeButton';
import { QuickActions } from '@/components/home/QuickActions';
import { NearbyShops } from '@/components/home/NearbyShops';
import { useUserStatsContext } from '@/contexts/UserStatsContext';
import logo from '@/assets/logo.png';

export default function HomePage() {
  const { profile, isLoading } = useUserStatsContext();
  
  const displayName = profile?.name?.split(' ')[0] || 'Гость';
  
  return (
    <AppLayout>
      <div className="safe-area-top">
        {/* Header */}
        <div className="px-4 py-4 flex items-center justify-between">
          <div>
            <p className="text-muted-foreground text-sm">Привет,</p>
            {isLoading ? (
              <div className="h-7 w-24 bg-muted rounded animate-pulse" />
            ) : (
              <h1 className="text-xl font-bold text-foreground">{displayName} 👋</h1>
            )}
          </div>
          <div className="w-20 h-20">
            <img src={logo} alt="subday" className="w-full h-full object-contain" />
          </div>
        </div>
        
        {/* Content */}
        <div className="px-4 space-y-4">
          <BalanceCard />
          <GetCoffeeButton />
          <QuickActions />
          <NearbyShops />
        </div>
      </div>
    </AppLayout>
  );
}
