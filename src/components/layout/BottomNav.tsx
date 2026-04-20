import { IconHomeInfinity, IconRosetteDiscountCheck, IconLiveView, IconUsersGroup, IconUserScan } from '@tabler/icons-react';
import { Link, useLocation } from 'react-router-dom';
import { usePrefetch } from '@/hooks/usePrefetch';
import { useCallback } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useVibration } from '@/hooks/useVibration';
import { motion, AnimatePresence, LayoutGroup } from 'framer-motion';

export function BottomNav() {
  const location = useLocation();
  const { prefetchPage } = usePrefetch();
  const { t } = useLanguage();
  const { vibrateShort } = useVibration();
  
  const navItems = [
    { icon: IconHomeInfinity, labelKey: 'nav.home', path: '/', prefetchKey: 'home' as const },
    { icon: IconRosetteDiscountCheck, labelKey: 'nav.packages', path: '/packages', prefetchKey: 'packages' as const },
    { icon: IconLiveView, labelKey: 'nav.shops', path: '/shops', prefetchKey: 'shops' as const },
    { icon: IconUsersGroup, labelKey: 'nav.subflow', path: '/subflow', prefetchKey: 'subflow' as const },
    { icon: IconUserScan, labelKey: 'nav.profile', path: '/profile', prefetchKey: 'profile' as const },
  ];

  const handleMouseEnter = useCallback((prefetchKey: 'home' | 'packages' | 'shops' | 'subflow' | 'profile') => {
    prefetchPage(prefetchKey);
  }, [prefetchPage]);

  const handleTouchStart = useCallback((prefetchKey: 'home' | 'packages' | 'shops' | 'subflow' | 'profile') => {
    prefetchPage(prefetchKey);
  }, [prefetchPage]);

  const handleClick = useCallback(() => {
    vibrateShort();
  }, [vibrateShort]);
  
  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 app-nav-shell px-3 pointer-events-none">
      <nav className="liquid-glass-nav app-nav-bar rounded-2xl max-w-lg mx-auto pointer-events-auto">
        <LayoutGroup>
          <div className="flex h-full items-center justify-around px-1.5 py-1">
            {navItems.map((item) => {
              const isActive = location.pathname === item.path;
              const Icon = item.icon;
              
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  onMouseEnter={() => handleMouseEnter(item.prefetchKey)}
                  onTouchStart={() => handleTouchStart(item.prefetchKey)}
                  onClick={handleClick}
                  className={`flex-1 flex flex-col items-center gap-0.5 py-1.5 px-1 rounded-xl min-w-0 relative transition-colors duration-200 ${
                    isActive ? 'text-accent' : 'text-muted-foreground'
                  }`}
                >
                  <AnimatePresence>
                    {isActive && (
                      <motion.span
                        layoutId="nav-pill"
                        className="absolute inset-0 rounded-xl liquid-nav-pill"
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.9 }}
                        transition={{ type: 'spring', stiffness: 400, damping: 28 }}
                      />
                    )}
                  </AnimatePresence>
                  <motion.div
                    animate={isActive 
                      ? { scale: 1.18, y: -2 } 
                      : { scale: 1, y: 0 }
                    }
                    transition={{ type: 'spring', stiffness: 450, damping: 20 }}
                    className="relative z-10"
                  >
                    <Icon 
                      size={21} 
                      stroke={isActive ? 2.4 : 1.6}
                      className="shrink-0 transition-all duration-200"
                    />
                  </motion.div>
                  <motion.span 
                    animate={isActive 
                      ? { opacity: 1, y: 0, scale: 1.02 } 
                      : { opacity: 0.6, y: 0, scale: 1 }
                    }
                    transition={{ duration: 0.2 }}
                    className={`text-[9px] sm:text-[10px] leading-tight text-center truncate w-full relative z-10 ${
                      isActive ? 'font-bold' : 'font-medium'
                    }`}
                  >
                    {t(item.labelKey)}
                  </motion.span>
                </Link>
              );
            })}
          </div>
        </LayoutGroup>
      </nav>
    </div>
  );
}
