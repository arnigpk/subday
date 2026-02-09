import { useEffect, useCallback } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { PullToRefresh } from '@/components/layout/PullToRefresh';
import { BalanceCard } from '@/components/home/BalanceCard';
import { GetCoffeeButton } from '@/components/home/GetCoffeeButton';
import { TopShopsCarousel } from '@/components/home/TopShopsCarousel';
import { useUserStatsContext } from '@/contexts/UserStatsContext';
import { useAdminAuth } from '@/hooks/useAdminAuth';
import { usePaymentResult } from '@/hooks/usePaymentResult';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import logo from '@/assets/logo.png';
import { usePrefetch } from '@/hooks/usePrefetch';
import { useQueryClient } from '@tanstack/react-query';

export default function HomePage() {
  const { profile, isLoading, refetch } = useUserStatsContext();
  const { role, isAdmin, isPartner, isBarista } = useAdminAuth();
  const navigate = useNavigate();
  const { prefetchAll } = usePrefetch();
  const queryClient = useQueryClient();
  
  // Handle payment result (show success/error toast)
  usePaymentResult();
  
  // Prefetch data for other pages when home page loads
  useEffect(() => {
    prefetchAll();
  }, [prefetchAll]);
  
  const handleRefresh = useCallback(async () => {
    await Promise.all([
      refetch(),
      queryClient.invalidateQueries({ queryKey: ['shops'] }),
    ]);
  }, [refetch, queryClient]);
  
  const displayName = profile?.name?.split(' ')[0] || 'Гость';
  
  const showAdminButton = isAdmin || role === 'moderator' || isPartner || isBarista;
  
  const handleAdminClick = () => {
    if (isAdmin || role === 'moderator') {
      navigate('/admin');
    } else if (isPartner || isBarista) {
      navigate('/partner');
    }
  };
  
  return (
    <AppLayout>
      <PullToRefresh onRefresh={handleRefresh}>
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
            <div className="flex items-center gap-2">
              {showAdminButton && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleAdminClick}
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
          
          {/* Content */}
          <div className="px-4 space-y-5">
            {/* Top shops carousel */}
            <TopShopsCarousel />
            
            <BalanceCard />
            <GetCoffeeButton />
          </div>
        </div>
      </PullToRefresh>
    </AppLayout>
  );
}
