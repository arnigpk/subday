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
  const navigate = useNavigate();
  const { prefetchAll } = usePrefetch();
  const queryClient = useQueryClient();
  const { vibrateShort } = useVibration();
  
  const { showPopup, popupOffer, dismissPopup } = useSpecialOffer();
  const { requestPermissionAndToken, token: fcmToken, error: fcmError } = usePushNotifications();
  
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
                <span className="text-2xl">🇰🇿</span>
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
            <Button
              variant="outline"
              className="w-full"
              onClick={() => requestPermissionAndToken()}
            >
              🔔 Enable Notifications (FCM)
            </Button>
            {fcmToken && (
              <div className="space-y-2 rounded-lg border border-border bg-card p-3">
                <div className="text-xs font-medium text-muted-foreground">FCM Token:</div>
                <textarea
                  readOnly
                  value={fcmToken}
                  onClick={(e) => (e.target as HTMLTextAreaElement).select()}
                  className="w-full h-24 text-xs font-mono rounded-md border border-input bg-background p-2 break-all"
                />
                <Button
                  size="sm"
                  variant="secondary"
                  className="w-full"
                  onClick={() => {
                    navigator.clipboard.writeText(fcmToken);
                  }}
                >
                  📋 Copy Token
                </Button>
              </div>
            )}
            {fcmError && (
              <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-xs text-destructive break-words">
                <div className="font-medium mb-1">FCM Error:</div>
                {fcmError}
              </div>
            )}
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
