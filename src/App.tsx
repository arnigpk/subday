import { useState, useEffect, lazy, Suspense } from 'react';
import defaultPreloader from '@/assets/preloader.gif';
import logo from '@/assets/logo.png';
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Session } from "@supabase/supabase-js";
import { AuthScreen } from "@/components/auth/AuthScreen";
import { UserStatsProvider } from "@/contexts/UserStatsContext";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { useTelegramWebApp } from "@/hooks/useTelegramWebApp";
import { useVibration } from "@/hooks/useVibration";

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
const StreaksPage = lazy(() => import("./pages/StreaksPage"));
const BonusesPage = lazy(() => import("./pages/BonusesPage"));
const GiftCoffeePage = lazy(() => import("./pages/GiftCoffeePage"));

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

// Lazy-loaded partner pages
const PartnerProtectedRoute = lazy(() => import("@/components/partner/PartnerProtectedRoute").then(m => ({ default: m.PartnerProtectedRoute })));
const PartnerDashboard = lazy(() => import("./pages/partner/PartnerDashboard"));
const PartnerScanPage = lazy(() => import("./pages/partner/PartnerScanPage"));
const PartnerHistoryPage = lazy(() => import("./pages/partner/PartnerHistoryPage"));
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

const AppContent = () => {
  const [session, setSession] = useState<Session | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [isPreloaderDone, setIsPreloaderDone] = useState(false);
  const [gifFailed, setGifFailed] = useState(false);
  const [preloaderSrc, setPreloaderSrc] = useState(defaultPreloader);
  const [telegramAuthAttempted, setTelegramAuthAttempted] = useState(false);
  
  const { vibrateShort } = useVibration();
  
  const { isReady: isTelegramReady, isTelegramMiniApp, getInitData } = useTelegramWebApp();
  
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    const loadConfig = async () => {
      try {
        const { data: configData } = supabase.storage.from('app-assets').getPublicUrl('preloader-config.json');
        const res = await fetch(configData.publicUrl + '?t=' + Date.now());
        if (cancelled) return;
        
        if (res.ok) {
          const config = await res.json();
          if (cancelled) return;
          
          const isEnabled = config?.enabled !== false;
          if (!isEnabled) {
            setIsPreloaderDone(true);
            return;
          }
          const dur = config?.duration ?? 2;
          timer = setTimeout(() => setIsPreloaderDone(true), dur * 1000);
        } else {
          // No config file yet — use default 2s
          timer = setTimeout(() => setIsPreloaderDone(true), 2000);
        }
      } catch {
        if (!cancelled) {
          timer = setTimeout(() => setIsPreloaderDone(true), 2000);
        }
      }
    };

    loadConfig();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, []);

  // Load custom preloader from storage if available
  useEffect(() => {
    const { data } = supabase.storage.from('app-assets').getPublicUrl('preloader.gif');
    if (data?.publicUrl) {
      const img = new Image();
      img.onload = () => setPreloaderSrc(data.publicUrl + '?t=' + Date.now());
      img.onerror = () => {}; // keep default
      img.src = data.publicUrl;
    }
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
          supabase.functions.invoke('guest-access', {
            body: { action: 'claim' },
          }).then(({ data }) => {
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
      <div className="min-h-screen bg-[#FAF9F6] flex items-center justify-center">
        {gifFailed ? (
          <img 
            src={logo} 
            alt="Loading" 
            className="w-24 h-24 animate-pulse"
          />
        ) : (
          <img 
            src={preloaderSrc} 
            alt="Loading" 
            className="w-full h-full object-contain max-w-screen max-h-screen"
            onError={() => setGifFailed(true)}
          />
        )}
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
            <Route path="/streaks" element={<StreaksPage />} />
            <Route path="/bonuses" element={<BonusesPage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/gift-coffee" element={<GiftCoffeePage />} />
            <Route path="/subflow" element={<SubFlowPage />} />
            
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
            <Route path="/admin/settings" element={<AdminProtectedRoute allowedRoles={['admin']}><AdminSettingsPage /></AdminProtectedRoute>} />
            
            {/* Partner Routes */}
            <Route path="/partner" element={<PartnerProtectedRoute allowBarista={false}><PartnerDashboard /></PartnerProtectedRoute>} />
            <Route path="/partner/scan" element={<PartnerProtectedRoute><PartnerScanPage /></PartnerProtectedRoute>} />
            <Route path="/partner/history" element={<PartnerProtectedRoute allowBarista={false}><PartnerHistoryPage /></PartnerProtectedRoute>} />
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
