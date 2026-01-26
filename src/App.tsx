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

const queryClient = new QueryClient();

const App = () => {
  const [session, setSession] = useState<Session | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [isPreloaderDone, setIsPreloaderDone] = useState(false);
  
  // Минимальное время показа прелоадера (1.5 секунды)
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsPreloaderDone(true);
    }, 1500);
    return () => clearTimeout(timer);
  }, []);
  
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
  
  const isLoading = isAuthLoading || !isPreloaderDone;
  
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
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Sonner />
          <AuthScreen onComplete={handleAuthComplete} />
        </TooltipProvider>
      </QueryClientProvider>
    );
  }
  
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <UserStatsProvider>
          <BrowserRouter>
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
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </UserStatsProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
