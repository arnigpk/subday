import { useState, useEffect, useRef } from 'react';

export function useScrollDirection(threshold = 10) {
  const [isHeaderVisible, setIsHeaderVisible] = useState(true);
  const lastScrollY = useRef(0);
  const ticking = useRef(false);

  useEffect(() => {
    const handleScroll = () => {
      if (ticking.current) return;
      ticking.current = true;

      requestAnimationFrame(() => {
        const currentScrollY = window.scrollY;
        const diff = currentScrollY - lastScrollY.current;

        if (currentScrollY < 10) {
          setIsHeaderVisible(true);
        } else if (diff > threshold) {
          setIsHeaderVisible(false);
        } else if (diff < -threshold) {
          setIsHeaderVisible(true);
        }

        lastScrollY.current = currentScrollY;
        ticking.current = false;
      });
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [threshold]);

  return isHeaderVisible;
}
