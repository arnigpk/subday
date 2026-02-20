import { useEffect, useCallback, useRef } from 'react';
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
import { LanguageSwitcher } from '@/components/LanguageSwitcher';

import logo from '@/assets/logo.png';
import kzOrnament from '@/assets/kz-ornament.png';
import { usePrefetch } from '@/hooks/usePrefetch';
import { useQueryClient } from '@tanstack/react-query';
import { useVibration } from '@/hooks/useVibration';

export default function HomePage() {
  const { profile, isLoading, refetch } = useUserStatsContext();
  const { role, isAdmin, isPartner, isBarista } = useAdminAuth();
  const navigate = useNavigate();
  const { prefetchAll } = usePrefetch();
  const queryClient = useQueryClient();
  const { vibrateShort } = useVibration();
  
  usePaymentResult();
  
  useEffect(() => {
    prefetchAll();
  }, [prefetchAll]);
  
  const handleRefresh = useCallback(async () => {
    await Promise.all([
      refetch(),
      queryClient.invalidateQueries({ queryKey: ['shops'] }),
    ]);
    vibrateShort();
  }, [refetch, queryClient, vibrateShort]);
  
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
            <div className="flex items-center">
              <span className="text-2xl">🇰🇿</span>
            </div>
            <div className="absolute left-1/2 -translate-x-1/2">
              <div className="w-20 h-20">
                <img src={logo} alt="subday" className="w-full h-full object-contain" />
              </div>
            </div>
            <div className="flex items-center gap-2">
              {showAdminButton && (
                <button
                  onClick={handleAdminClick}
                  className="text-2xl leading-none"
                  aria-label="Панель управления"
                >
                  💻
                </button>
              )}
              <LanguageSwitcher />
            </div>
          </div>
          
          {/* Content */}
          <div className="px-4 space-y-5">
            <TopShopsCarousel />
            <BalanceCard />
            <GetCoffeeButton />
            <AdBannerCarousel location="home" />
          </div>
        </div>
      </PullToRefresh>
    </AppLayout>
  );
}
