import { useState, useEffect, lazy, Suspense, useCallback, ReactNode } from 'react';
import Lottie from 'lottie-react';
import defaultPreloaderAnimation from '@/assets/preloader.json';

import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Session } from "@supabase/supabase-js";
import { AuthScreen } from "@/components/auth/AuthScreen";
import { OnboardingTutorial } from "@/components/onboarding/OnboardingTutorial";
import { useOnboarding } from "@/hooks/useOnboarding";
import { UserStatsProvider } from "@/contexts/UserStatsContext";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { useTelegramWebApp } from "@/hooks/useTelegramWebApp";
import { useVibration } from "@/hooks/useVibration";
import { usePaymentResult } from "@/hooks/usePaymentResult";
import { PENDING_PAYMENT_KEY } from "@/hooks/usePayment";
import { PaymentSuccessAnimation } from "@/components/payment/PaymentSuccessAnimation";
import { useGeoNotifications } from "@/hooks/useGeoNotifications";
import { useBackgroundGeoNotifications } from "@/hooks/useBackgroundGeoNotifications";
import { useSubscriptionStatus } from "@/hooks/useSubscriptionStatus";
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
import PayReturnPage from "./pages/PayReturnPage";

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

    // Native status bar: dark icons on the light theme + matching background.
    // (Only style/color — no overlay change, so layout is untouched.)
    import('@capacitor/status-bar').then(({ StatusBar, Style }) => {
      StatusBar.setStyle({ style: Style.Light }).catch(() => {});
      if (Capacitor.getPlatform() === 'android') {
        StatusBar.setBackgroundColor({ color: '#f5f0e8' }).catch(() => {});
      }
    }).catch(() => {});

    // Handle deep link when app is opened via URL
    const handleAppUrlOpen = (data: { url: string }) => {
      try {
        const url = new URL(data.url);

        // Возврат из оплаты: subday://pay?status=success&order=..&path=/packages
        // Страница-«отскок» на web.subday.app перебрасывает сюда после оплаты.
        if (url.protocol === 'subday:' || url.hostname === 'pay') {
          const status = url.searchParams.get('status') || 'success';
          const order = url.searchParams.get('order') || '';
          const returnPath = url.searchParams.get('path') || '/packages';
          try { localStorage.removeItem(PENDING_PAYMENT_KEY); } catch { /* ignore */ }
          import('@capacitor/browser').then(({ Browser }) => Browser.close().catch(() => {}));
          navigate(`${returnPath}?payment=${status}&order=${order}`);
          return;
        }

        const path = url.pathname + url.search + url.hash;
        if (path && path !== '/') {
          navigate(path);
        }
      } catch (e) {
        console.error('Deep link parse error:', e);
      }
    };

    CapApp.addListener('appUrlOpen', handleAppUrlOpen);

    // Fallback: пользователь закрыл оверлей оплаты вручную (или deep-link не сработал).
    // Проверяем незавершённый платёж и подтверждаем его на сервере.
    let browserSub: { remove: () => void } | null = null;
    import('@capacitor/browser').then(({ Browser }) => {
      Browser.addListener('browserFinished', async () => {
        let pending: any = null;
        try { pending = JSON.parse(localStorage.getItem(PENDING_PAYMENT_KEY) || 'null'); } catch { /* ignore */ }
        if (!pending?.orderId) return;
        try { localStorage.removeItem(PENDING_PAYMENT_KEY); } catch { /* ignore */ }
        try {
          const { data } = await supabase.functions.invoke('verify-payment', {
            body: { order_id: pending.orderId },
          });
          if (data?.success) {
            navigate(`${pending.returnPath || '/packages'}?payment=success&order=${pending.orderId}`);
          }
        } catch (e) {
          console.warn('[payment] verify on close failed', e);
        }
      }).then((h) => { browserSub = h; });
    });

    return () => {
      CapApp.removeAllListeners();
      if (browserSub) browserSub.remove();
    };
  }, [navigate]);

  return null;
}

function PaymentResultHandler() {
  const { showSuccessAnimation, dismissSuccessAnimation } = usePaymentResult();
  return <PaymentSuccessAnimation show={showSuccessAnimation} onComplete={dismissSuccessAnimation} />;
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

  // Строгая проверка активной подписки — фоновый foreground-service (батарея!)
  // поднимаем только для платящих подписчиков. Веб-версия фильтруется на сервере.
  const { activeSubscriptions } = useSubscriptionStatus();
  const hasSub = activeSubscriptions.length > 0;
  const isNative = Capacitor.isNativePlatform();

  // Веб/мини-апп: только когда приложение открыто (foreground JS).
  useGeoNotifications(enabled && !isNative);
  // Натив (APK/iOS): фоновый вотчер — доходит даже с закрытым приложением.
  useBackgroundGeoNotifications(enabled && isNative && hasSub);
  return null;
}

// Установи true чтобы заблокировать доступ из обычного браузера
const BLOCK_BROWSER_ACCESS = false;

function WebBlockedScreen() {
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-8 text-center gap-6">
      <img src="/icon-192.png" alt="subday" className="w-20 h-20 rounded-2xl" />
      <div>
        <h1 className="text-2xl font-black text-foreground mb-2">Откройте в приложении</h1>
        <p className="text-muted-foreground text-sm">
          Это приложение доступно только через Telegram или мобильное приложение subday.
        </p>
      </div>
      <a
        href="tg://resolve?domain=subday_lgbot&start=login"
        className="w-full max-w-xs h-12 rounded-2xl bg-[#0088cc] text-white font-bold flex items-center justify-center gap-2 text-sm"
      >
        Открыть в Telegram
      </a>
      <div className="flex gap-4 text-xs text-muted-foreground/50">
        <a href="/admin" className="hover:underline">Панель администратора</a>
        <a href="/partner" className="hover:underline">Панель партнёра</a>
      </div>
    </div>
  );
}

function PlatformGuard({ children, isTelegramMiniApp }: { children: ReactNode; isTelegramMiniApp: boolean }) {
  const location = useLocation();
  const isNative = Capacitor.isNativePlatform();
  const isBrowser = !isTelegramMiniApp && !isNative;
  const isAllowed = location.pathname.startsWith('/admin') || location.pathname.startsWith('/partner');

  if (BLOCK_BROWSER_ACCESS && isBrowser && !isAllowed) {
    return <WebBlockedScreen />;
  }

  return <>{children}</>;
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

  const { vibrateShort, vibratePreloader } = useVibration();

  // Soft ramp-up haptic that plays together with the splash/preloader on app open.
  useEffect(() => {
    vibratePreloader();
  }, [vibratePreloader]);

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

      // Офлайн-кэш кастомного прелоадера: успешную загрузку сохраняем локально,
      // а при запуске БЕЗ интернета берём из кэша — чтобы офлайн показывался
      // актуальный (новый) прелоадер, а не вшитый старый. Вшитый — последний фолбэк.
      const PRELOADER_CACHE_KEY = 'subday_preloader_cache';
      let cached: { config?: any; anim?: any } | null = null;
      try { cached = JSON.parse(localStorage.getItem(PRELOADER_CACHE_KEY) || 'null'); } catch { /* ignore */ }

      if (customAnim) {
        try {
          localStorage.setItem(PRELOADER_CACHE_KEY, JSON.stringify({
            config: config ?? cached?.config ?? null,
            anim: customAnim,
          }));
        } catch { /* квота localStorage — не критично, просто без кэша */ }
      }

      const effectiveConfig = config ?? cached?.config ?? null;

      // Приоритет: свежескачанный → кэшированный → вшитый дефолт.
      setAnimationData(customAnim || cached?.anim || defaultPreloaderAnimation);
      setAnimationReady(true);

      const isEnabled = effectiveConfig?.enabled !== false;
      if (!isEnabled) {
        setIsPreloaderDone(true);
        return;
      }

      // Show preloader for the FULL configured duration, measured from app
      // start. If config fetch took some time, subtract elapsed so total
      // visible time matches admin setting exactly.
      const dur = (effectiveConfig?.duration ?? 2) * 1000;
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
  // Preloader is shown for the EXACT admin-configured duration.
  // Auth + Telegram init happen in the background during this time.
  // After the preloader finishes, we still wait briefly for auth/telegram
  // to settle (almost always already done) before rendering the app.
  const isPreloaderVisible = !isPreloaderDone;
  const isBackgroundLoading = isAuthLoading || !isTelegramReady || isTelegramAuthPending;
  const isLoading = isPreloaderVisible || isBackgroundLoading;

  // Vibrate when loading completes
  useEffect(() => {
    if (!isLoading) {
      vibrateShort();
    }
  }, [isLoading, vibrateShort]);
  
  const { showOnboarding, maybeShowOnboarding, completeOnboarding } = useOnboarding();

  const handleAuthComplete = (isNewUser?: boolean) => {
    maybeShowOnboarding(!!isNewUser);
  };

  // Privacy policy must be reachable WITHOUT login — it's a public URL requirement
  // for Google Play / App Store review. Render it before the auth gate & preloader.
  if (typeof window !== 'undefined' && window.location.pathname === '/privacy') {
    return (
      <BrowserRouter>
        <PrivacyPolicyPage />
      </BrowserRouter>
    );
  }

  // Страница-возврат после оплаты (открывается в Custom Tabs/Safari VC на web.subday.app,
  // перебрасывает обратно в приложение). Публичная, без авторизации и прелоадера.
  if (typeof window !== 'undefined' && window.location.pathname === '/pay-return') {
    return <PayReturnPage />;
  }

  if (isLoading) {
    return (
      <div className="fixed inset-0 bg-[#FAF9F6] overflow-hidden">
        {/* Show Lottie ONLY while the preloader timer is active. After it
            ends, keep a clean background while background tasks finish.

            The container fills the actual viewport of the current device
            (no fixed 9:16 box), so the animation always covers the full
            screen edge-to-edge — phones, tablets and desktops each get
            their own fit instead of letterboxing around a fixed ratio.
            `xMidYMid slice` scales the animation uniformly and crops the
            overflow, so it stretches to fill without distorting. */}
        {isPreloaderVisible && animationReady && animationData ? (
          <div
            className="absolute inset-0"
            style={{ width: '100vw', height: '100dvh' }}
          >
            <Lottie
              animationData={animationData}
              loop
              autoplay
              rendererSettings={{ preserveAspectRatio: 'xMidYMid slice' }}
              style={{ width: '100%', height: '100%', display: 'block' }}
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
        {showOnboarding && <OnboardingTutorial onComplete={completeOnboarding} />}
        <PlatformGuard isTelegramMiniApp={isTelegramMiniApp}>
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
        </PlatformGuard>
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
