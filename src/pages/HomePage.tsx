import { useEffect, memo, useCallback } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { BalanceCard } from '@/components/home/BalanceCard';
import { GetCoffeeButton } from '@/components/home/GetCoffeeButton';
import { TopShopsByVisits } from '@/components/home/NearbyShops';
import { TopShopsCarousel } from '@/components/home/TopShopsCarousel';
import { useUserStatsContext } from '@/contexts/UserStatsContext';
import { useAdminAuth } from '@/hooks/useAdminAuth';
import { usePaymentResult } from '@/hooks/usePaymentResult';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import logo from '@/assets/logo.png';
import { usePrefetch } from '@/hooks/usePrefetch';

const Header = memo(function Header({ 
  displayName, 
  isLoading, 
  showAdminButton, 
  isAdmin, 
  role, 
  onAdminClick 
}: { 
  displayName: string; 
  isLoading: boolean; 
  showAdminButton: boolean; 
  isAdmin: boolean; 
  role: string | null; 
  onAdminClick: () => void;
}) {
  return (
    <div className="px-4 py-4 flex items-center justify-between">
      <div>
        <p className="text-muted-foreground text-sm">Привет,</p>
        {isLoading ? (
          <div className="h-7 w-24 bg-muted rounded animate-pulse" />
        ) : (
          <h1 className="text-xl font-bold text-foreground">{displayName} 👋</h1>
        )}
      </div>
      <div className="flex items-center gap-2">
        {showAdminButton && (
          <Button
            variant="outline"
            size="sm"
            onClick={onAdminClick}
            className="text-xs font-medium"
          >
            {isAdmin || role === 'moderator' ? 'Админка' : 'Кабинет'}
          </Button>
        )}
        <div className="w-20 h-20">
          <img src={logo} alt="subday" className="w-full h-full object-contain" />
        </div>
      </div>
    </div>
  );
});

export default function HomePage() {
  const { profile, isLoading, refetch } = useUserStatsContext();
  const { role, isAdmin, isPartner, isBarista } = useAdminAuth();
  const navigate = useNavigate();
  const { prefetchAll } = usePrefetch();
  
  // Handle payment result (show success/error toast)
  usePaymentResult();
  
  // Prefetch data for other pages when home page loads
  useEffect(() => {
    prefetchAll();
  }, [prefetchAll]);
  
  const displayName = profile?.name?.split(' ')[0] || 'Гость';
  
  const showAdminButton = isAdmin || role === 'moderator' || isPartner || isBarista;
  
  const handleAdminClick = useCallback(() => {
    if (isAdmin || role === 'moderator') {
      navigate('/admin');
    } else if (isPartner || isBarista) {
      navigate('/partner');
    }
  }, [isAdmin, role, isPartner, isBarista, navigate]);
  
  return (
    <AppLayout>
      <div className="safe-area-top">
        <Header
          displayName={displayName}
          isLoading={isLoading}
          showAdminButton={showAdminButton}
          isAdmin={isAdmin}
          role={role}
          onAdminClick={handleAdminClick}
        />
        
        {/* Content */}
        <div className="px-4 space-y-5">
          {/* Top shops carousel */}
          <TopShopsCarousel />
          
          <BalanceCard />
          <GetCoffeeButton />
          <TopShopsByVisits />
        </div>
      </div>
    </AppLayout>
  );
}
