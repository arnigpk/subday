import { Home, Coffee, MapPin, Zap, User } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { usePrefetch } from '@/hooks/usePrefetch';
import { useCallback } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';

export function BottomNav() {
  const location = useLocation();
  const { prefetchPage } = usePrefetch();
  const { t } = useLanguage();
  
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
    <nav className="fixed bottom-0 left-0 right-0 bg-card/95 backdrop-blur-lg border-t border-border safe-area-bottom z-50">
      <div className="flex items-center justify-around px-1 py-1 max-w-lg mx-auto">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          const Icon = item.icon;
          
          return (
            <Link
              key={item.path}
              to={item.path}
              onMouseEnter={() => handleMouseEnter(item.prefetchKey)}
              onTouchStart={() => handleTouchStart(item.prefetchKey)}
              className={`nav-item flex-1 transition-all duration-200 ${
                isActive ? 'nav-item-active scale-105' : 'nav-item-inactive'
              }`}
            >
              <Icon 
                size={18} 
                strokeWidth={isActive ? 2.5 : 2}
                className="transition-all duration-200 shrink-0"
              />
              <span className={`text-[9px] sm:text-[10px] font-medium leading-tight text-center truncate w-full ${isActive ? 'font-bold' : ''}`}>
                {t(item.labelKey)}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
