import { AppLayout } from '@/components/layout/AppLayout';
import { BalanceCard } from '@/components/home/BalanceCard';
import { GetCoffeeButton } from '@/components/home/GetCoffeeButton';
import { QuickActions } from '@/components/home/QuickActions';
import { NearbyShops } from '@/components/home/NearbyShops';
import { userData } from '@/data/mockData';
import logo from '@/assets/logo.png';

export default function HomePage() {
  return (
    <AppLayout>
      <div className="safe-area-top">
        {/* Header */}
        <div className="px-4 py-4 flex items-center justify-between">
          <div>
            <p className="text-muted-foreground text-sm">Привет,</p>
            <h1 className="text-xl font-bold text-foreground">{userData.name} 👋</h1>
          </div>
          <div className="w-10 h-10">
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
