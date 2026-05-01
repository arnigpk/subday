import { useState, useEffect, lazy, Suspense, useCallback } from 'react';
import Lottie from 'lottie-react';
import defaultPreloaderAnimation from '@/assets/preloader.json';

import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Session } from "@supabase/supabase-js";
import { AuthScreen } from "@/components/auth/AuthScreen";
import { UserStatsProvider } from "@/contexts/UserStatsContext";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { useTelegramWebApp } from "@/hooks/useTelegramWebApp";
import { useVibration } from "@/hooks/useVibration";
import { usePaymentResult } from "@/hooks/usePaymentResult";
import { useGeoNotifications } from "@/hooks/useGeoNotifications";
import { PermissionsBootstrap } from "@/components/permissions/PermissionsBootstrap";
import { Capacitor } from "@capacitor/core";
import { App as CapApp } from "@capacitor/app";

// Eager-loaded core pages
import HomePage from "./pages/HomePage";
import PackagesPage from "./pages/PackagesPage";
import PackageDetailPage from "./pages/PackageDetailPage";
import ShopsPage from "./pages/ShopsPage";
import ShopDetailPage from "./pages/ShopDetailPage";
import RedeemPage from "./pages/RedeemPage";
import ProfilePage from "./pages/ProfilePage";
import NotFound from "./pages/NotFound";
import SubFlowPage from "./pages/SubFlowPage";

// Lazy-loaded secondary pages
const HistoryPage = lazy(() => import("./pages/HistoryPage"));
const GiftCoffeePage = lazy(() => import("./pages/GiftCoffeePage"));
const PrivacyPolicyPage = lazy(() => import("./pages/PrivacyPolicyPage"));

// Register service worker for PWA  
if ('serviceWorker' in navigator) {
  import('virtual:pwa-register').then(({ registerSW }) => {
    registerSW({ immediate: true });
  });
}

// Lazy-loaded admin pages
const AdminProtectedRoute = lazy(() => import("@/components/admin/AdminProtectedRoute").then(m => ({ default: m.AdminProtectedRoute })));
const AdminDashboard = lazy(() => import("./pages/admin/AdminDashboard"));
const AdminUsersPage = lazy(() => import("./pages/admin/AdminUsersPage"));
const AdminHistoryPage = lazy(() => import("./pages/admin/AdminHistoryPage"));
const AdminShopsPage = lazy(() => import("./pages/admin/AdminShopsPage"));
const AdminSettingsPage = lazy(() => import("./pages/admin/AdminSettingsPage"));
const AdminSubscriptionsPage = lazy(() => import("./pages/admin/AdminSubscriptionsPage"));
const AdminBroadcastPage = lazy(() => import("./pages/admin/AdminBroadcastPage"));
const AdminPushBroadcastPage = lazy(() => import("./pages/admin/AdminPushBroadcastPage"));
const AdminSubscriptionTransactionsPage = lazy(() => import("./pages/admin/AdminSubscriptionTransactionsPage"));
const AdminBannersPage = lazy(() => import("./pages/admin/AdminBannersPage"));
const AdminSpecialOffersPage = lazy(() => import("./pages/admin/AdminSpecialOffersPage"));
const AdminAutoNotificationsPage = lazy(() => import("./pages/admin/AdminAutoNotificationsPage"));
const AdminPreloaderPage = lazy(() => import("./pages/admin/AdminPreloaderPage"));
const AdminSubFlowAdsPage = lazy(() => import("./pages/admin/AdminSubFlowAdsPage"));
const AdminQRSettingsPage = lazy(() => import("./pages/admin/AdminQRSettingsPage"));
const AdminMessagesPage = lazy(() => import("./pages/admin/AdminMessagesPage"));

// Lazy-loaded partner pages
const PartnerProtectedRoute = lazy(() => import("@/components/partner/PartnerProtectedRoute").then(m => ({ default: m.PartnerProtectedRoute })));
const PartnerDashboard = lazy(() => import("./pages/partner/PartnerDashboard"));
const PartnerScanPage = lazy(() => import("./pages/partner/PartnerScanPage"));
const PartnerHistoryPage = lazy(() => import("./pages/partner/PartnerHistoryPage"));
const BaristaShiftHistory = lazy(() => import("./pages/partner/BaristaShiftHistory"));
const PartnerStaffPage = lazy(() => import("./pages/partner/PartnerStaffPage"));
const PartnerAdvertisingPage = lazy(() => import("./pages/partner/PartnerAdvertisingPage"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30 * 1000,
      gcTime: 5 * 60 * 1000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

function LazyFallback() {
  return (
    <div className="min-h-screen bg-background">
      <div className="safe-area-top">
        <div className="px-4 py-4">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-muted animate-pulse" />
            <div className="h-6 w-32 bg-muted rounded animate-pulse" />
          </div>
          <div className="space-y-4">
            <div className="card-static animate-pulse">
              <div className="h-20 w-full bg-muted rounded-xl" />
            </div>
            <div className="card-static animate-pulse">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-12 h-12 rounded-xl bg-muted" />
                <div className="flex-1">
                  <div className="h-4 w-24 bg-muted rounded mb-2" />
                  <div className="h-3 w-32 bg-muted rounded" />
                </div>
              </div>
            </div>
            <div className="card-static animate-pulse">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-12 h-12 rounded-xl bg-muted" />
                <div className="flex-1">
                  <div className="h-4 w-28 bg-muted rounded mb-2" />
                  <div className="h-3 w-20 bg-muted rounded" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Deep link handler for native apps (Universal Links / App Links)
function DeepLinkHandler() {
  const navigate = useNavigate();

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    // Handle deep link when app is opened via URL
    const handleAppUrlOpen = (data: { url: string }) => {
      try {
        const url = new URL(data.url);
        const path = url.pathname + url.search + url.hash;
        if (path && path !== '/') {
          navigate(path);
        }
      } catch (e) {
        console.error('Deep link parse error:', e);
      }
    };

    CapApp.addListener('appUrlOpen', handleAppUrlOpen);

    return () => {
      CapApp.removeAllListeners();
    };
  }, [navigate]);

  return null;
}

function PaymentResultHandler() {
  usePaymentResult();
  return null;
}

function GeoNotificationsRunner() {
  // Тумблер пользователя из профиля. Сервер ТАКЖЕ проверяет это поле,
  // но отключаем и на клиенте, чтобы не дёргать edge function зря.
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || cancelled) return;
      const { data } = await (supabase as any)
        .from('profiles')
        .select('geo_notifications_enabled')
        .eq('user_id', user.id)
        .maybeSingle();
      if (cancelled) return;
      setEnabled(data?.geo_notifications_enabled !== false);

      // Реактивно отслеживаем изменение тумблера
      channel = supabase
        .channel(`geo-toggle-${user.id}`)
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `user_id=eq.${user.id}` },
          (payload: any) => {
            const next = payload.new?.geo_notifications_enabled;
            if (typeof next === 'boolean') setEnabled(next);
          }
        )
        .subscribe();
    })();

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, []);

  useGeoNotifications(enabled);
  return null;
}

const AppContent = () => {
  const [session, setSession] = useState<Session | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [isPreloaderDone, setIsPreloaderDone] = useState(false);
  // Start as null — do NOT show bundled animation immediately, otherwise old
  // preloader flashes for a moment before custom one loads from storage.
  const [animationData, setAnimationData] = useState<any>(null);
  const [animationReady, setAnimationReady] = useState(false);
  const [telegramAuthAttempted, setTelegramAuthAttempted] = useState(false);

  const { vibrateShort } = useVibration();

  const { isReady: isTelegramReady, isTelegramMiniApp, getInitData } = useTelegramWebApp();

  // Load preloader animation + config in parallel. The preloader is shown
  // for the EXACT duration set in admin, while the rest of the app
  // (auth, Telegram init, etc.) loads in the background.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;
    const startTime = Date.now();

    const cacheBust = `?t=${Date.now()}`;
    const { data: configData } = supabase.storage.from('app-assets').getPublicUrl('preloader-config.json');
    const { data: animData } = supabase.storage.from('app-assets').getPublicUrl('preloader.json');

    const fetchOpts: RequestInit = { cache: 'no-store' };

    const configPromise = fetch(configData.publicUrl + cacheBust, fetchOpts)
      .then((res) => (res.ok ? res.json() : null))
      .catch(() => null);

    const animPromise = fetch(animData.publicUrl + cacheBust, fetchOpts)
      .then((res) => (res.ok ? res.json() : null))
      .catch(() => null);

    Promise.all([configPromise, animPromise]).then(([config, customAnim]) => {
      if (cancelled) return;

      // Pick custom anim if present, else fall back to bundled default.
      setAnimationData(customAnim || defaultPreloaderAnimation);
      setAnimationReady(true);

      const isEnabled = config?.enabled !== false;
      if (!isEnabled) {
        setIsPreloaderDone(true);
        return;
      }

      // Show preloader for the FULL configured duration, measured from app
      // start. If config fetch took some time, subtract elapsed so total
      // visible time matches admin setting exactly.
      const dur = (config?.duration ?? 2) * 1000;
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, dur - elapsed);
      timer = setTimeout(() => setIsPreloaderDone(true), remaining);
    });

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, []);



  // Telegram Mini App auto-login
  useEffect(() => {
    if (!isTelegramReady || telegramAuthAttempted) return;
    
    const attemptTelegramAuth = async () => {
      if (!isTelegramMiniApp) {
        setTelegramAuthAttempted(true);
        return;
      }
      
      const initData = getInitData();
      if (!initData) {
        setTelegramAuthAttempted(true);
        return;
      }
      
      try {
        const { data, error } = await supabase.functions.invoke('telegram-miniapp-auth', {
          body: { initData }
        });
        
        if (error) {
          setTelegramAuthAttempted(true);
          return;
        }
        
        if (data?.session) {
          await supabase.auth.setSession({
            access_token: data.session.access_token,
            refresh_token: data.session.refresh_token
          });
        }
      } catch (err) {
        console.error('Telegram auth error:', err);
      }
      
      setTelegramAuthAttempted(true);
    };
    
    attemptTelegramAuth();
  }, [isTelegramReady, isTelegramMiniApp, getInitData, telegramAuthAttempted]);
  
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setIsAuthLoading(false);
        if (event === 'SIGNED_IN' && session) {
          const tryClaim = async (attempt = 0): Promise<any> => {
            const { data, error } = await supabase.functions.invoke('guest-access', {
              body: { action: 'claim' },
            });
            // Retry once on transient edge runtime cold-start errors
            if (error && attempt < 1) {
              await new Promise((r) => setTimeout(r, 1500));
              return tryClaim(attempt + 1);
            }
            return data;
          };
          tryClaim().then((data) => {
            if (data?.success) {
              setTimeout(() => {
                import('sonner').then(({ toast }) => {
                  toast.success('Вам подарили 1 кофе на 10 дней ☕️', { duration: 6000 });
                });
              }, 2000);
            }
          }).catch(() => {});
        }
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setIsAuthLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);
  
  const isTelegramAuthPending = isTelegramMiniApp && !telegramAuthAttempted;
  const isLoading = isAuthLoading || !isPreloaderDone || !isTelegramReady || isTelegramAuthPending;

  // Vibrate when loading completes
  useEffect(() => {
    if (!isLoading) {
      vibrateShort();
    }
  }, [isLoading, vibrateShort]);
  
  const handleAuthComplete = () => {};
  
  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#FAF9F6] flex items-center justify-center p-6">
        {animationReady && animationData ? (
          <div
            className="aspect-square mx-auto"
            style={{ width: 'min(80vw, 80vh, 480px)' }}
          >
            <Lottie
              animationData={animationData}
              loop
              autoplay
              rendererSettings={{ preserveAspectRatio: 'xMidYMid meet' }}
              style={{ width: '100%', height: '100%' }}
            />
          </div>
        ) : null}
      </div>
    );
  }
  
  if (!session) {
    return (
      <>
        <Sonner />
        <AuthScreen onComplete={handleAuthComplete} />
      </>
    );
  }
  
  return (
    <UserStatsProvider>
      <BrowserRouter>
        <PaymentResultHandler />
        <DeepLinkHandler />
        <GeoNotificationsRunner />
        <PermissionsBootstrap />
        <Toaster />
        <Sonner />
        <Suspense fallback={<LazyFallback />}>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/packages" element={<PackagesPage />} />
            <Route path="/packages/:id" element={<PackageDetailPage />} />
            <Route path="/shops" element={<ShopsPage />} />
            <Route path="/shops/:id" element={<ShopDetailPage />} />
            <Route path="/redeem" element={<RedeemPage />} />
            <Route path="/history" element={<HistoryPage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/gift-coffee" element={<GiftCoffeePage />} />
            <Route path="/subflow" element={<SubFlowPage />} />
            <Route path="/privacy" element={<PrivacyPolicyPage />} />
            
            {/* Admin Routes */}
            <Route path="/admin" element={<AdminProtectedRoute allowedRoles={['admin', 'moderator']}><AdminDashboard /></AdminProtectedRoute>} />
            <Route path="/admin/users" element={<AdminProtectedRoute allowedRoles={['admin', 'moderator']}><AdminUsersPage /></AdminProtectedRoute>} />
            <Route path="/admin/history" element={<AdminProtectedRoute><AdminHistoryPage /></AdminProtectedRoute>} />
            <Route path="/admin/shops" element={<AdminProtectedRoute><AdminShopsPage /></AdminProtectedRoute>} />
            <Route path="/admin/subscriptions" element={<AdminProtectedRoute allowedRoles={['admin']}><AdminSubscriptionsPage /></AdminProtectedRoute>} />
            <Route path="/admin/broadcast" element={<AdminProtectedRoute allowedRoles={['admin']}><AdminBroadcastPage /></AdminProtectedRoute>} />
            <Route path="/admin/push-broadcast" element={<AdminProtectedRoute allowedRoles={['admin']}><AdminPushBroadcastPage /></AdminProtectedRoute>} />
            <Route path="/admin/subscription-transactions" element={<AdminProtectedRoute allowedRoles={['admin']}><AdminSubscriptionTransactionsPage /></AdminProtectedRoute>} />
            <Route path="/admin/banners" element={<AdminProtectedRoute allowedRoles={['admin']}><AdminBannersPage /></AdminProtectedRoute>} />
            <Route path="/admin/special-offers" element={<AdminProtectedRoute allowedRoles={['admin']}><AdminSpecialOffersPage /></AdminProtectedRoute>} />
            <Route path="/admin/auto-notifications" element={<AdminProtectedRoute allowedRoles={['admin']}><AdminAutoNotificationsPage /></AdminProtectedRoute>} />
            <Route path="/admin/preloader" element={<AdminProtectedRoute allowedRoles={['admin']}><AdminPreloaderPage /></AdminProtectedRoute>} />
            <Route path="/admin/subflow-ads" element={<AdminProtectedRoute allowedRoles={['admin']}><AdminSubFlowAdsPage /></AdminProtectedRoute>} />
            <Route path="/admin/qr-settings" element={<AdminProtectedRoute allowedRoles={['admin']}><AdminQRSettingsPage /></AdminProtectedRoute>} />
            <Route path="/admin/messages" element={<AdminProtectedRoute allowedRoles={['admin']}><AdminMessagesPage /></AdminProtectedRoute>} />
            <Route path="/admin/settings" element={<AdminProtectedRoute allowedRoles={['admin']}><AdminSettingsPage /></AdminProtectedRoute>} />
            
            {/* Partner Routes */}
            <Route path="/partner" element={<PartnerProtectedRoute allowBarista={false}><PartnerDashboard /></PartnerProtectedRoute>} />
            <Route path="/partner/scan" element={<PartnerProtectedRoute><PartnerScanPage /></PartnerProtectedRoute>} />
            <Route path="/partner/history" element={<PartnerProtectedRoute allowBarista={false}><PartnerHistoryPage /></PartnerProtectedRoute>} />
            <Route path="/partner/my-shift" element={<PartnerProtectedRoute><BaristaShiftHistory /></PartnerProtectedRoute>} />
            <Route path="/partner/staff" element={<PartnerProtectedRoute allowBarista={false}><PartnerStaffPage /></PartnerProtectedRoute>} />
            <Route path="/partner/advertising" element={<PartnerProtectedRoute allowBarista={false}><PartnerAdvertisingPage /></PartnerProtectedRoute>} />
            
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </UserStatsProvider>
  );
};

const App = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <LanguageProvider>
          <AppContent />
        </LanguageProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
