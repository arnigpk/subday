import { useState, useEffect, useCallback } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { PullToRefresh } from '@/components/layout/PullToRefresh';
import { LiquidGlassHeader } from '@/components/layout/LiquidGlassHeader';
import { BalanceCard } from '@/components/home/BalanceCard';
import { GetCoffeeButton } from '@/components/home/GetCoffeeButton';
import { TopShopsCarousel } from '@/components/home/TopShopsCarousel';
import { AdBannerCarousel } from '@/components/shop/AdBannerCarousel';
import { useUserStatsContext } from '@/contexts/UserStatsContext';
import { useAdminAuth } from '@/hooks/useAdminAuth';
import { useB2BAuth } from '@/hooks/useB2BAuth';
import { useNavigate } from 'react-router-dom';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { PushNotificationsBell } from '@/components/home/PushNotificationsBell';
import { SpecialOfferPopup } from '@/components/special-offer/SpecialOfferPopup';
import { useSpecialOffer } from '@/hooks/useSpecialOffer';

import logo from '@/assets/logo.png';
import kzOrnament from '@/assets/kz-ornament.png';
import { usePrefetch } from '@/hooks/usePrefetch';
import { useQueryClient } from '@tanstack/react-query';
import { useVibration } from '@/hooks/useVibration';
import { AppMessageBanner } from '@/components/home/AppMessageBanner';

export default function HomePage() {
  const { profile, isLoading, refetch } = useUserStatsContext();
  const [activeTab, setActiveTab] = useState<'coffee' | 'drinks'>('coffee');
  const { role, isAdmin, isPartner, isBarista } = useAdminAuth();
  const { isB2BAdmin } = useB2BAuth();
  const navigate = useNavigate();
  const { prefetchAll } = usePrefetch();
  const queryClient = useQueryClient();
  const { vibrateShort } = useVibration();
  
  const { showPopup, popupOffer, dismissPopup } = useSpecialOffer();
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
        <div>
          <LiquidGlassHeader>
            <div className="px-4 py-6 flex items-center justify-between relative">
              <div
                className="absolute inset-0 opacity-15 pointer-events-none"
                style={{
                  backgroundImage: `url(${kzOrnament})`,
                  backgroundRepeat: 'repeat-x',
                  backgroundSize: 'auto 80%',
                  backgroundPosition: 'center',
                }}
              />
              <div className="flex items-center gap-2">
                <span
                  className="text-2xl"
                  onClick={() => {
                    // Скрытый жест: 7 быстрых тапов по флагу включают/выключают
                    // оверлей замеров старта (Слой 4). Обычные пользователи не заметят.
                    const w = window as unknown as { __flagTaps?: number; __flagT?: number };
                    const now = Date.now();
                    w.__flagTaps = (now - (w.__flagT || 0) < 600 ? (w.__flagTaps || 0) : 0) + 1;
                    w.__flagT = now;
                    if (w.__flagTaps >= 7) {
                      const on = localStorage.getItem('subday_perf') === '1';
                      localStorage.setItem('subday_perf', on ? '0' : '1');
                      location.reload();
                    }
                  }}
                >🇰🇿</span>
                {showAdminButton && (
                  <button
                    onClick={handleAdminClick}
                    className="text-2xl leading-none"
                    aria-label="Панель управления"
                  >
                    💻
                  </button>
                )}
                {isB2BAdmin && (
                  <button
                    onClick={() => navigate('/b2b')}
                    className="text-2xl leading-none"
                    aria-label="Кабинет B2B"
                  >
                    🏢
                  </button>
                )}
              </div>
              <div className="absolute left-1/2 -translate-x-1/2">
                <div className="w-20 h-20">
                  <img src={logo} alt="subday" className="w-full h-full object-contain" />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <PushNotificationsBell />
                <LanguageSwitcher />
              </div>
            </div>
          </LiquidGlassHeader>
          
          {/* Content */}
          <div className="px-4 space-y-5">
            <TopShopsCarousel />
            <BalanceCard activeTab={activeTab} onTabChange={setActiveTab} />
            <GetCoffeeButton activeTab={activeTab} />
            <AdBannerCarousel location="home" />
          </div>
        </div>
        
        <AppMessageBanner />
        
        {popupOffer && (
          <SpecialOfferPopup
            open={showPopup}
            onDismiss={dismissPopup}
            offerPrice={popupOffer.offer.offer_price}
            offerCups={popupOffer.offer.offer_cups_count}
            offerDays={popupOffer.offer.offer_duration_days}
            eligibleUntil={popupOffer.eligibleUntil}
            offerName={popupOffer.offer.name}
            description={popupOffer.offer.description}
          />
        )}
      </PullToRefresh>
    </AppLayout>
  );
}
