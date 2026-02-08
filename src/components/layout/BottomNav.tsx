import { Home, Coffee, MapPin, Zap, User } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { usePrefetch } from '@/hooks/usePrefetch';
import { useCallback, memo } from 'react';

const navItems = [
  { icon: Home, label: 'Главная', path: '/', prefetchKey: 'home' as const },
  { icon: Coffee, label: 'Подписки', path: '/packages', prefetchKey: 'packages' as const },
  { icon: MapPin, label: 'Кофейни', path: '/shops', prefetchKey: 'shops' as const },
  { icon: Zap, label: 'subFlow', path: '/subflow', prefetchKey: 'subflow' as const },
  { icon: User, label: 'Профиль', path: '/profile', prefetchKey: 'profile' as const },
];

const NavItem = memo(({ 
  item, 
  isActive, 
  onPrefetch 
}: { 
  item: typeof navItems[0]; 
  isActive: boolean; 
  onPrefetch: (key: 'home' | 'packages' | 'shops' | 'subflow' | 'profile') => void;
}) => {
  const Icon = item.icon;
  
  return (
    <Link
      to={item.path}
      onMouseEnter={() => onPrefetch(item.prefetchKey)}
      onTouchStart={() => onPrefetch(item.prefetchKey)}
      className={`nav-item transition-all duration-200 py-1 ${
        isActive ? 'nav-item-active scale-105' : 'nav-item-inactive'
      }`}
    >
      <Icon 
        size={20} 
        strokeWidth={isActive ? 2.5 : 2}
        className="transition-all duration-200"
      />
      <span className={`text-[10px] font-medium ${isActive ? 'font-bold' : ''}`}>
        {item.label}
      </span>
    </Link>
  );
});
NavItem.displayName = 'NavItem';

export const BottomNav = memo(function BottomNav() {
  const location = useLocation();
  const { prefetchPage } = usePrefetch();
  
  const handlePrefetch = useCallback((prefetchKey: 'home' | 'packages' | 'shops' | 'subflow' | 'profile') => {
    prefetchPage(prefetchKey);
  }, [prefetchPage]);
  
  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-card/95 backdrop-blur-lg border-t border-border safe-area-bottom z-50">
      <div className="flex items-center justify-around px-1 py-1.5">
        {navItems.map((item) => (
          <NavItem 
            key={item.path}
            item={item}
            isActive={location.pathname === item.path}
            onPrefetch={handlePrefetch}
          />
        ))}
      </div>
    </nav>
  );
});
