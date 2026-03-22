import { IconHomeInfinity, IconRosetteDiscountCheck, IconMapPin, IconBolt, IconUser } from '@tabler/icons-react';
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
    { icon: IconMapPin, labelKey: 'nav.shops', path: '/shops', prefetchKey: 'shops' as const },
    { icon: IconBolt, labelKey: 'nav.subflow', path: '/subflow', prefetchKey: 'subflow' as const },
    { icon: IconUser, labelKey: 'nav.profile', path: '/profile', prefetchKey: 'profile' as const },
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
    <div className="fixed bottom-0 left-0 right-0 z-50 safe-area-bottom px-3 pb-2 pointer-events-none">
      <nav className="liquid-glass-nav rounded-2xl max-w-lg mx-auto pointer-events-auto">
        <LayoutGroup>
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
                  onClick={handleClick}
                  className={`flex-1 flex flex-col items-center gap-0.5 py-2 px-1 rounded-xl min-w-0 relative ${
                    isActive ? 'text-foreground' : 'text-muted-foreground'
                  }`}
                >
                  <AnimatePresence>
                    {isActive && (
                      <motion.span
                        layoutId="nav-pill"
                        className="absolute inset-0 rounded-xl liquid-nav-pill"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                      />
                    )}
                  </AnimatePresence>
                  <motion.div
                    animate={isActive ? { scale: 1.15, y: -1 } : { scale: 1, y: 0 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 22 }}
                    className="relative z-10"
                  >
                    <Icon 
                      size={20} 
                      stroke={isActive ? 2.5 : 1.8}
                      className="shrink-0 transition-colors duration-200"
                    />
                  </motion.div>
                  <motion.span 
                    animate={isActive ? { opacity: 1, y: 0 } : { opacity: 0.7, y: 0 }}
                    transition={{ duration: 0.2 }}
                    className={`text-[9px] sm:text-[10px] leading-tight text-center truncate w-full relative z-10 ${
                      isActive ? 'font-extrabold' : 'font-medium'
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
