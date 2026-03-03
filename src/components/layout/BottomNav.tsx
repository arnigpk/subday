import { Home, Coffee, MapPin, Zap, User } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { usePrefetch } from '@/hooks/usePrefetch';
import { useCallback } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useVibration } from '@/hooks/useVibration';

export function BottomNav() {
  const location = useLocation();
  const { prefetchPage } = usePrefetch();
  const { t } = useLanguage();
  const { vibrateShort } = useVibration();
  
  const navItems = [
    { icon: Home, labelKey: 'nav.home', path: '/', prefetchKey: 'home' as const },
    { icon: Coffee, labelKey: 'nav.packages', path: '/packages', prefetchKey: 'packages' as const },
    { icon: MapPin, labelKey: 'nav.shops', path: '/shops', prefetchKey: 'shops' as const },
    { icon: Zap, labelKey: 'nav.subflow', path: '/subflow', prefetchKey: 'subflow' as const },
    { icon: User, labelKey: 'nav.profile', path: '/profile', prefetchKey: 'profile' as const },
  ];

  const handleMouseEnter = useCallback((prefetchKey: 'home' | 'packages' | 'shops' | 'subflow' | 'profile') => {
    prefetchPage(prefetchKey);
  }, [prefetchPage]);

  const handleTouchStart = useCallback((prefetchKey: 'home' | 'packages' | 'shops' | 'subflow' | 'profile') => {
    prefetchPage(prefetchKey);
  }, [prefetchPage]);
  
  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 safe-area-bottom px-3 pb-2">
      <nav className="liquid-glass-nav rounded-2xl max-w-lg mx-auto">
        <div className="flex items-center justify-around px-1 py-1.5">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            const Icon = item.icon;
            
            return (
              <Link
                key={item.path}
                to={item.path}
                onMouseEnter={() => handleMouseEnter(item.prefetchKey)}
                onTouchStart={() => handleTouchStart(item.prefetchKey)}
                onClick={() => vibrateShort()}
                className={`liquid-nav-item flex-1 flex flex-col items-center gap-0.5 py-2 px-1 rounded-xl transition-all duration-300 min-w-0 relative ${
                  isActive ? 'liquid-nav-active' : 'liquid-nav-inactive'
                }`}
              >
                {isActive && (
                  <span className="absolute inset-0 rounded-xl liquid-nav-pill" />
                )}
                <Icon 
                  size={20} 
                  strokeWidth={isActive ? 2.5 : 1.8}
                  className={`transition-all duration-300 shrink-0 relative z-10 ${
                    isActive ? 'drop-shadow-[0_0_6px_hsl(var(--accent)/0.5)]' : ''
                  }`}
                />
                <span className={`text-[9px] sm:text-[10px] leading-tight text-center truncate w-full relative z-10 transition-all duration-300 ${
                  isActive ? 'font-bold' : 'font-medium'
                }`}>
                  {t(item.labelKey)}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
