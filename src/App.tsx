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
import NotFound from "./pages/NotFound";
import { AdminProtectedRoute } from "@/components/admin/AdminProtectedRoute";
import AdminDashboard from "./pages/admin/AdminDashboard";
import AdminUsersPage from "./pages/admin/AdminUsersPage";
import AdminHistoryPage from "./pages/admin/AdminHistoryPage";
import AdminShopsPage from "./pages/admin/AdminShopsPage";
import AdminSettingsPage from "./pages/admin/AdminSettingsPage";
import AdminSubscriptionsPage from "./pages/admin/AdminSubscriptionsPage";
import AdminBroadcastPage from "./pages/admin/AdminBroadcastPage";
import { PartnerProtectedRoute } from "@/components/partner/PartnerProtectedRoute";
import PartnerDashboard from "./pages/partner/PartnerDashboard";
import PartnerScanPage from "./pages/partner/PartnerScanPage";
import PartnerHistoryPage from "./pages/partner/PartnerHistoryPage";
import PartnerStaffPage from "./pages/partner/PartnerStaffPage";

const queryClient = new QueryClient();

const AppContent = () => {
  const [session, setSession] = useState<Session | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [isPreloaderDone, setIsPreloaderDone] = useState(false);
  const [telegramAuthAttempted, setTelegramAuthAttempted] = useState(false);
  
  const { isReady: isTelegramReady, isTelegramMiniApp, getInitData } = useTelegramWebApp();
  
  // Минимальное время показа прелоадера (1.5 секунды)
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
    return (
      <div className="min-h-screen bg-[#FAF9F6] flex items-center justify-center">
        <img 
          src={preloader} 
          alt="Loading" 
          className="w-full h-full object-contain max-w-screen max-h-screen"
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
          
          {/* Admin Routes */}
          <Route path="/admin" element={<AdminProtectedRoute allowedRoles={['admin', 'moderator']}><AdminDashboard /></AdminProtectedRoute>} />
          <Route path="/admin/users" element={<AdminProtectedRoute allowedRoles={['admin', 'moderator']}><AdminUsersPage /></AdminProtectedRoute>} />
          <Route path="/admin/history" element={<AdminProtectedRoute><AdminHistoryPage /></AdminProtectedRoute>} />
          <Route path="/admin/shops" element={<AdminProtectedRoute><AdminShopsPage /></AdminProtectedRoute>} />
          <Route path="/admin/subscriptions" element={<AdminProtectedRoute allowedRoles={['admin']}><AdminSubscriptionsPage /></AdminProtectedRoute>} />
          <Route path="/admin/broadcast" element={<AdminProtectedRoute allowedRoles={['admin']}><AdminBroadcastPage /></AdminProtectedRoute>} />
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
        <AppContent />
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
