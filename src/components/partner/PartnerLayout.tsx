import { ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, QrCode, History, Users, LogOut, ChevronLeft, Megaphone, ClipboardList } from 'lucide-react';
import { usePartnerAuth } from '@/hooks/usePartnerAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';

interface PartnerLayoutProps {
  children: ReactNode;
}

export function PartnerLayout({ children }: PartnerLayoutProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { isPartner, isBarista, shopName } = usePartnerAuth();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = '/';
  };
  
  const handleBackToApp = () => {
    navigate('/');
  };

  // Navigation items - partners see all, baristas see dashboard + scan only
  const navItems = isPartner
    ? [
        { path: '/partner', icon: LayoutDashboard, label: 'Дашборд' },
        { path: '/partner/scan', icon: QrCode, label: 'Сканер' },
        { path: '/partner/history', icon: History, label: 'История' },
        { path: '/partner/staff', icon: Users, label: 'Сотрудники' },
        { path: '/partner/advertising', icon: Megaphone, label: 'Реклама' },
      ]
    : isBarista
    ? [
        { path: '/partner/scan', icon: QrCode, label: 'Сканер' },
        { path: '/partner/my-shift', icon: ClipboardList, label: 'Моя смена' },
      ]
    : [
        { path: '/partner/scan', icon: QrCode, label: 'Сканер' },
      ];

  return (
    <div className="min-safe-screen bg-background flex flex-col overflow-x-hidden">
      {/* Header — sticky for long lists */}
      <header className="bg-card border-b border-border sticky top-0 z-30">
        <div className="safe-area-top" />
        <div className="flex items-center justify-between gap-2 px-3 sm:px-4 pb-2 pt-2">
          <div className="min-w-0 flex-1">
            <button 
              onClick={handleBackToApp}
              className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors text-xs sm:text-sm mb-1"
            >
              <ChevronLeft size={14} />
              <span>В приложение</span>
            </button>
            <h1 className="text-base sm:text-lg font-bold text-foreground truncate">
              {shopName || 'Партнёрский кабинет'}
            </h1>
            <p className="text-[10px] sm:text-xs text-muted-foreground">
              {isPartner ? 'Владелец' : 'Бариста'}
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={handleLogout} className="shrink-0">
            <LogOut size={20} />
          </Button>
        </div>

        {/* Navigation */}
        <nav className="border-t border-border px-2">
          <div className="flex gap-1 overflow-x-auto scrollbar-hide">
            {navItems.map((item) => {
              const isActive = location.pathname === item.path;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`flex items-center gap-1.5 px-3 sm:px-4 py-2.5 sm:py-3 text-xs sm:text-sm font-medium whitespace-nowrap transition-colors shrink-0 ${
                    isActive
                      ? 'text-primary border-b-2 border-primary'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <item.icon size={16} />
                  {item.label}
                </Link>
              );
            })}
          </div>
        </nav>
      </header>

      {/* Main Content */}
      <main className="flex-1 min-h-0 overflow-auto pb-8 safe-area-bottom w-full">
        {children}
      </main>
    </div>
  );
}
