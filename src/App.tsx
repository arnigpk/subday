import { useState, useEffect, lazy, Suspense, memo } from 'react';
import preloader from '@/assets/preloader.gif';
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Session } from "@supabase/supabase-js";
import { AuthScreen } from "@/components/auth/AuthScreen";
import { UserStatsProvider } from "@/contexts/UserStatsContext";
import { useTelegramWebApp } from "@/hooks/useTelegramWebApp";

// Eagerly loaded - critical path pages
import HomePage from "./pages/HomePage";

// Lazy loaded pages - main app
const PackagesPage = lazy(() => import("./pages/PackagesPage"));
const PackageDetailPage = lazy(() => import("./pages/PackageDetailPage"));
const ShopsPage = lazy(() => import("./pages/ShopsPage"));
const ShopDetailPage = lazy(() => import("./pages/ShopDetailPage"));
const RedeemPage = lazy(() => import("./pages/RedeemPage"));
const HistoryPage = lazy(() => import("./pages/HistoryPage"));
const StreaksPage = lazy(() => import("./pages/StreaksPage"));
const BonusesPage = lazy(() => import("./pages/BonusesPage"));
const ProfilePage = lazy(() => import("./pages/ProfilePage"));
const SubFlowPage = lazy(() => import("./pages/SubFlowPage"));
const NotFound = lazy(() => import("./pages/NotFound"));

// Lazy loaded admin pages
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

// Lazy loaded partner pages
const PartnerDashboard = lazy(() => import("./pages/partner/PartnerDashboard"));
const PartnerScanPage = lazy(() => import("./pages/partner/PartnerScanPage"));
const PartnerHistoryPage = lazy(() => import("./pages/partner/PartnerHistoryPage"));
const PartnerStaffPage = lazy(() => import("./pages/partner/PartnerStaffPage"));

// Lazy loaded protected routes
const AdminProtectedRoute = lazy(() => import("@/components/admin/AdminProtectedRoute").then(m => ({ default: m.AdminProtectedRoute })));
const PartnerProtectedRoute = lazy(() => import("@/components/partner/PartnerProtectedRoute").then(m => ({ default: m.PartnerProtectedRoute })));

// Optimized QueryClient with aggressive caching
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000, // 1 minute before data is considered stale
      gcTime: 10 * 60 * 1000, // 10 minutes cache time
      refetchOnWindowFocus: false,
      refetchOnMount: false, // Don't refetch if data exists
      refetchOnReconnect: false,
      retry: 1,
      networkMode: 'offlineFirst', // Use cache first
    },
  },
});

// Minimal loading fallback - instant transition feel
const PageLoader = memo(() => (
  <div className="min-h-screen bg-background flex items-center justify-center">
    <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
  </div>
));
PageLoader.displayName = 'PageLoader';

// Full screen preloader for initial load
const FullPreloader = memo(() => (
  <div className="min-h-screen bg-[#FAF9F6] flex items-center justify-center">
    <img 
      src={preloader} 
      alt="Loading" 
      className="w-full h-full object-contain max-w-screen max-h-screen"
    />
  </div>
));
FullPreloader.displayName = 'FullPreloader';

const AppContent = () => {
  const [session, setSession] = useState<Session | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [isPreloaderDone, setIsPreloaderDone] = useState(false);
  const [telegramAuthAttempted, setTelegramAuthAttempted] = useState(false);
  
  const { isReady: isTelegramReady, isTelegramMiniApp, getInitData } = useTelegramWebApp();
  
  // Minimum preloader time (1.5 seconds)
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsPreloaderDone(true);
    }, 1500);
    return () => clearTimeout(timer);
  }, []);
  
  // Telegram Mini App auto-login
  useEffect(() => {
    if (!isTelegramReady || telegramAuthAttempted) return;
    
    const attemptTelegramAuth = async () => {
      if (!isTelegramMiniApp) {
        console.log('Not a Telegram Mini App, skipping auto-login');
        setTelegramAuthAttempted(true);
        return;
      }
      
      const initData = getInitData();
      if (!initData) {
        console.log('No initData available');
        setTelegramAuthAttempted(true);
        return;
      }
      
      console.log('Attempting Telegram Mini App auto-login...');
      
      try {
        const { data, error } = await supabase.functions.invoke('telegram-miniapp-auth', {
          body: { initData }
        });
        
        if (error) {
          console.error('Telegram Mini App auth error:', error);
          setTelegramAuthAttempted(true);
          return;
        }
        
        if (data?.session) {
          console.log('Telegram Mini App auto-login successful');
          await supabase.auth.setSession({
            access_token: data.session.access_token,
            refresh_token: data.session.refresh_token
          });
        } else if (data?.error) {
          console.error('Auth error:', data.error);
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
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setIsAuthLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);
  
  // Wait for both auth loading and telegram auth attempt (if applicable)
  const isTelegramAuthPending = isTelegramMiniApp && !telegramAuthAttempted;
  const isLoading = isAuthLoading || !isPreloaderDone || !isTelegramReady || isTelegramAuthPending;
  
  const handleAuthComplete = () => {
    // Session will be updated via onAuthStateChange
  };
  
  if (isLoading) {
    return <FullPreloader />;
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
        <Suspense fallback={<PageLoader />}>
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
            <Route path="/admin/settings" element={<AdminProtectedRoute allowedRoles={['admin']}><AdminSettingsPage /></AdminProtectedRoute>} />
            
            {/* Partner Routes */}
            <Route path="/partner" element={<PartnerProtectedRoute allowBarista={false}><PartnerDashboard /></PartnerProtectedRoute>} />
            <Route path="/partner/scan" element={<PartnerProtectedRoute><PartnerScanPage /></PartnerProtectedRoute>} />
            <Route path="/partner/history" element={<PartnerProtectedRoute allowBarista={false}><PartnerHistoryPage /></PartnerProtectedRoute>} />
            <Route path="/partner/staff" element={<PartnerProtectedRoute allowBarista={false}><PartnerStaffPage /></PartnerProtectedRoute>} />
            
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
        <AppContent />
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
