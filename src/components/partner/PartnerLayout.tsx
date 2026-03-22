import { ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Squares2X2Icon, QrCodeIcon, ClockIcon, UserGroupIcon, ArrowRightStartOnRectangleIcon, ChevronLeftIcon, MegaphoneIcon } from '@heroicons/react/24/outline';
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
        { path: '/partner', icon: Squares2X2Icon, label: 'Дашборд' },
        { path: '/partner/scan', icon: QrCodeIcon, label: 'Сканер' },
        { path: '/partner/history', icon: ClockIcon, label: 'История' },
        { path: '/partner/staff', icon: UserGroupIcon, label: 'Сотрудники' },
        { path: '/partner/advertising', icon: MegaphoneIcon, label: 'Реклама' },
      ]
    : isBarista
    ? [
        { path: '/partner', icon: Squares2X2Icon, label: 'Дашборд' },
        { path: '/partner/scan', icon: QrCodeIcon, label: 'Сканер' },
      ]
    : [
        { path: '/partner/scan', icon: QrCodeIcon, label: 'Сканер' },
      ];

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="bg-card border-b border-border px-4 py-3 safe-area-top">
        <div className="flex items-center justify-between">
          <div>
            <button 
              onClick={handleBackToApp}
              className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors text-sm mb-1"
            >
              <ChevronLeftIcon className="w-4 h-4" />
              <span>В приложение</span>
            </button>
            <h1 className="text-lg font-bold text-foreground">
              {shopName || 'Партнёрский кабинет'}
            </h1>
            <p className="text-xs text-muted-foreground">
              {isPartner ? 'Владелец' : 'Бариста'}
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={handleLogout}>
            <ArrowRightStartOnRectangleIcon className="w-5 h-5" />
          </Button>
        </div>
      </header>

      {/* Navigation */}
      <nav className="bg-card border-b border-border px-2">
        <div className="flex gap-1 overflow-x-auto scrollbar-hide">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium whitespace-nowrap transition-colors ${
                  isActive
                    ? 'text-primary border-b-2 border-primary'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <item.icon size={18} />
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  );
}
