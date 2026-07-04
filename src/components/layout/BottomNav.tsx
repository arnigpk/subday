import { IconHomeInfinity, IconRosetteDiscountCheck, IconLiveView, IconUsersGroup, IconUserScan } from '@tabler/icons-react';
import { Link, useLocation } from 'react-router-dom';
import { usePrefetch } from '@/hooks/usePrefetch';
import { useCallback, useEffect, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useVibration } from '@/hooks/useVibration';
import { motion, AnimatePresence, LayoutGroup } from 'framer-motion';
import { Capacitor } from '@capacitor/core';
import { Keyboard } from '@capacitor/keyboard';

export function BottomNav() {
  const location = useLocation();
  const { prefetchPage } = usePrefetch();
  const { t } = useLanguage();
  const { vibrateSelection, vibrateShort } = useVibration();
  
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

  const handleClick = useCallback((isActive: boolean) => {
    if (isActive) vibrateShort();
    else vibrateSelection();
  }, [vibrateSelection, vibrateShort]);

  const [keyboardOpen, setKeyboardOpen] = useState(false);
  useEffect(() => {
    if (Capacitor.isNativePlatform()) {
      
      const showP = Keyboard.addListener('keyboardWillShow', () => setKeyboardOpen(true));
      const hideP = Keyboard.addListener('keyboardWillHide', () => setKeyboardOpen(false));
      return () => {
        showP.then((h) => h.remove());
        hideP.then((h) => h.remove());
      };
    }
    const vv = window.visualViewport;
    if (!vv) return;
    const onResize = () => setKeyboardOpen(window.innerHeight - vv.height > 150);
    vv.addEventListener('resize', onResize);
    return () => vv.removeEventListener('resize', onResize);
  }, []);

  if (keyboardOpen) return null;

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
                  onClick={() => handleClick(isActive)}
                  className={`flex-1 flex flex-col items-center gap-0.5 py-1.5 px-1 rounded-xl min-w-0 relative transition-colors duration-200 ${
                    isActive ? 'text-accent' : 'text-foreground'
                  }`}
                >
                  {isActive && (
                    <motion.span
                      className="absolute inset-0 rounded-xl liquid-nav-pill"
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ type: 'spring', stiffness: 400, damping: 28 }}
                    />
                  )}
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
                      stroke={isActive ? 2.4 : 2}
                      className="shrink-0 transition-all duration-200"
                    />
                  </motion.div>
                  <span className="text-[10px] sm:text-[11px] leading-tight text-center truncate w-full relative z-10 font-bold">
                    {t(item.labelKey)}
                  </span>
                </Link>
              );
            })}
          </div>
        </LayoutGroup>
      </nav>
    </div>
  );
}
