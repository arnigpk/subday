import { useEffect, useCallback } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { PullToRefresh } from '@/components/layout/PullToRefresh';
import { BalanceCard } from '@/components/home/BalanceCard';
import { GetCoffeeButton } from '@/components/home/GetCoffeeButton';
import { TopShopsCarousel } from '@/components/home/TopShopsCarousel';
import { AdBannerCarousel } from '@/components/shop/AdBannerCarousel';
import { useUserStatsContext } from '@/contexts/UserStatsContext';
import { useAdminAuth } from '@/hooks/useAdminAuth';
import { usePaymentResult } from '@/hooks/usePaymentResult';
import { useNavigate } from 'react-router-dom';

import logo from '@/assets/logo.png';
import kzOrnament from '@/assets/kz-ornament.png';
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
          <div className="px-4 py-6 flex items-center justify-between relative">
            {/* Kazakh ornament background */}
            <div
              className="absolute inset-0 opacity-15 pointer-events-none"
              style={{
                backgroundImage: `url(${kzOrnament})`,
                backgroundRepeat: 'repeat-x',
                backgroundSize: 'auto 80%',
                backgroundPosition: 'center',
              }}
            />
            <div>
              <p className="text-sm font-bold text-foreground">СДЕЛАНО В KZ 🇰🇿</p>
            </div>
            <div className="absolute left-1/2 -translate-x-1/2">
              <div className="w-20 h-20">
                <img src={logo} alt="subday" className="w-full h-full object-contain" />
              </div>
            </div>
            <div>
              {showAdminButton && (
                <button
                  onClick={handleAdminClick}
                  className="text-2xl leading-none"
                  aria-label="Панель управления"
                >
                  💻
                </button>
              )}
            </div>
          </div>
          
          {/* Content */}
          <div className="px-4 space-y-5">
            {/* Top shops carousel */}
            <TopShopsCarousel />
            
            <BalanceCard />
            <GetCoffeeButton />
            
            {/* Ad banners for home page */}
            <AdBannerCarousel location="home" />
          </div>
        </div>
      </PullToRefresh>
    </AppLayout>
  );
}
