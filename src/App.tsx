import { useState, useEffect } from 'react';
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
import { LanguageProvider } from "@/contexts/LanguageContext";
import { useTelegramWebApp } from "@/hooks/useTelegramWebApp";
import HomePage from "./pages/HomePage";
import PackagesPage from "./pages/PackagesPage";
import PackageDetailPage from "./pages/PackageDetailPage";
import ShopsPage from "./pages/ShopsPage";
import ShopDetailPage from "./pages/ShopDetailPage";
import RedeemPage from "./pages/RedeemPage";
import HistoryPage from "./pages/HistoryPage";
import StreaksPage from "./pages/StreaksPage";
import BonusesPage from "./pages/BonusesPage";
import ProfilePage from "./pages/ProfilePage";
import GiftCoffeePage from "./pages/GiftCoffeePage";
import SubFlowPage from "./pages/SubFlowPage";
import NotFound from "./pages/NotFound";
import { AdminProtectedRoute } from "@/components/admin/AdminProtectedRoute";
import AdminDashboard from "./pages/admin/AdminDashboard";
import AdminUsersPage from "./pages/admin/AdminUsersPage";
import AdminHistoryPage from "./pages/admin/AdminHistoryPage";
import AdminShopsPage from "./pages/admin/AdminShopsPage";
import AdminSettingsPage from "./pages/admin/AdminSettingsPage";
import AdminSubscriptionsPage from "./pages/admin/AdminSubscriptionsPage";
import AdminBroadcastPage from "./pages/admin/AdminBroadcastPage";
import AdminPushBroadcastPage from "./pages/admin/AdminPushBroadcastPage";
import AdminSubscriptionTransactionsPage from "./pages/admin/AdminSubscriptionTransactionsPage";
import AdminBannersPage from "./pages/admin/AdminBannersPage";
import { PartnerProtectedRoute } from "@/components/partner/PartnerProtectedRoute";
import PartnerDashboard from "./pages/partner/PartnerDashboard";
import PartnerScanPage from "./pages/partner/PartnerScanPage";
import PartnerHistoryPage from "./pages/partner/PartnerHistoryPage";
import PartnerStaffPage from "./pages/partner/PartnerStaffPage";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30 * 1000, // 30 seconds before data is considered stale
      gcTime: 5 * 60 * 1000, // 5 minutes cache time
      refetchOnWindowFocus: false, // Don't refetch on window focus for better UX
      retry: 1, // Reduce retries for faster failure
    },
  },
});

const AppContent = () => {
  const [session, setSession] = useState<Session | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [isPreloaderDone, setIsPreloaderDone] = useState(false);
  const [telegramAuthAttempted, setTelegramAuthAttempted] = useState(false);
  
  const { isReady: isTelegramReady, isTelegramMiniApp, getInitData } = useTelegramWebApp();
  
  
  // Minimum preloader display time (2 seconds)
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsPreloaderDone(true);
    }, 2000);
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
        // Auto-claim pending guest access on login
        if (event === 'SIGNED_IN' && session) {
          supabase.functions.invoke('guest-access', {
            body: { action: 'claim' },
          }).then(({ data }) => {
            if (data?.success) {
              // Will show toast after page loads
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
  
  // Wait for both auth loading and telegram auth attempt (if applicable)
  const isTelegramAuthPending = isTelegramMiniApp && !telegramAuthAttempted;
  const isLoading = isAuthLoading || !isPreloaderDone || !isTelegramReady || isTelegramAuthPending;
  
  const handleAuthComplete = () => {};
  
  if (isLoading) {
    return (
      <div className="fixed inset-0 bg-background flex items-center justify-center overflow-hidden">
        <img 
          src={preloader} 
          alt="Loading" 
          className="w-full h-full object-cover"
        />
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
          <Route path="/admin/settings" element={<AdminProtectedRoute allowedRoles={['admin']}><AdminSettingsPage /></AdminProtectedRoute>} />
          
          {/* Partner Routes */}
          <Route path="/partner" element={<PartnerProtectedRoute allowBarista={false}><PartnerDashboard /></PartnerProtectedRoute>} />
          <Route path="/partner/scan" element={<PartnerProtectedRoute><PartnerScanPage /></PartnerProtectedRoute>} />
          <Route path="/partner/history" element={<PartnerProtectedRoute allowBarista={false}><PartnerHistoryPage /></PartnerProtectedRoute>} />
          <Route path="/partner/staff" element={<PartnerProtectedRoute allowBarista={false}><PartnerStaffPage /></PartnerProtectedRoute>} />
          
          <Route path="*" element={<NotFound />} />
        </Routes>
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
