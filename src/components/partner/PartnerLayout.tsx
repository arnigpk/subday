import { ReactNode, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, QrCode, History, Users, LogOut, ChevronLeft, Megaphone, ClipboardList, ChevronDown, Check, Store } from 'lucide-react';
import { usePartnerAuth } from '@/hooks/usePartnerAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import { useSwipeBack } from '@/hooks/useSwipeBack';

interface PartnerLayoutProps {
  children: ReactNode;
}

export function PartnerLayout({ children }: PartnerLayoutProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { isPartner, isBarista, shopName, shops, selectedShopId, setSelectedShopId } = usePartnerAuth();
  const [shopDropdownOpen, setShopDropdownOpen] = useState(false);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = '/';
  };

  const handleBackToApp = () => navigate('/');

  useSwipeBack(handleBackToApp);

  useEffect(() => {
    const tg = (window as any).Telegram?.WebApp;
    if (tg?.BackButton) {
      tg.BackButton.show();
      tg.BackButton.onClick(handleBackToApp);
    }

    let capListener: { remove: () => void } | null = null;
    if (Capacitor.isNativePlatform()) {
      CapApp.addListener('backButton', handleBackToApp).then(l => { capListener = l; });
    }

    return () => {
      if (tg?.BackButton) {
        tg.BackButton.offClick(handleBackToApp);
        tg.BackButton.hide();
      }
      if (capListener) capListener.remove();
    };
  }, []);

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

  const hasMultipleShops = shops.length > 1;

  return (
    <div className="min-safe-screen bg-background flex flex-col overflow-x-hidden">
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

          <div className="flex items-center gap-1.5 shrink-0">
            {/* Shop selector — only if partner has multiple shops */}
            {hasMultipleShops && (
              <div className="relative">
                <button
                  onClick={() => setShopDropdownOpen(o => !o)}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-secondary hover:bg-secondary/80 transition-colors text-sm font-medium max-w-[130px] sm:max-w-[160px]"
                >
                  <Store size={13} className="shrink-0 text-primary" />
                  <span className="truncate text-foreground text-xs">{shopName}</span>
                  <ChevronDown size={13} className={`shrink-0 text-muted-foreground transition-transform ${shopDropdownOpen ? 'rotate-180' : ''}`} />
                </button>

                {shopDropdownOpen && (
                  <>
                    {/* Backdrop */}
                    <div
                      className="fixed inset-0 z-40"
                      onClick={() => setShopDropdownOpen(false)}
                    />
                    {/* Dropdown */}
                    <div
                      className="absolute right-0 top-full mt-2 z-50 bg-card border border-border rounded-2xl shadow-xl min-w-[220px] max-h-[70vh] overflow-y-auto overscroll-contain scrollbar-hide"
                      style={{ WebkitOverflowScrolling: 'touch' }}
                    >
                      <p className="sticky top-0 bg-card text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-3 pt-3 pb-1.5">
                        Мои кофейни
                      </p>
                      {shops.map(shop => (
                        <button
                          key={shop.id}
                          onClick={() => { setShopDropdownOpen(false); setSelectedShopId(shop.id); }}
                          className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors ${
                            shop.id === selectedShopId
                              ? 'bg-primary/10'
                              : 'hover:bg-secondary'
                          }`}
                        >
                          {shop.logo_url ? (
                            <img
                              src={shop.logo_url}
                              alt=""
                              className="w-9 h-9 rounded-xl object-cover shrink-0 border border-border"
                            />
                          ) : (
                            <div className="w-9 h-9 rounded-xl bg-secondary flex items-center justify-center shrink-0">
                              <Store size={16} className="text-muted-foreground" />
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm font-medium truncate ${shop.id === selectedShopId ? 'text-primary' : 'text-foreground'}`}>
                              {shop.name}
                            </p>
                            {shop.address && (
                              <p className="text-[11px] text-muted-foreground truncate">{shop.address}</p>
                            )}
                          </div>
                          {shop.id === selectedShopId && (
                            <Check size={15} className="text-primary shrink-0" />
                          )}
                        </button>
                      ))}
                      <div className="h-2" />
                    </div>
                  </>
                )}
              </div>
            )}

            <Button variant="ghost" size="icon" onClick={handleLogout}>
              <LogOut size={20} />
            </Button>
          </div>
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

      <main className="flex-1 min-h-0 overflow-auto w-full">
        <div className="pt-3 pb-8 safe-area-bottom">
          {children}
        </div>
      </main>
    </div>
  );
}
