import { useEffect } from 'react';

export function useSwipeBack(onSwipeBack: () => void) {
  useEffect(() => {
    let startX = 0;
    let startY = 0;
    let startTime = 0;

    const onTouchStart = (e: TouchEvent) => {
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      startTime = Date.now();
    };

    const onTouchEnd = (e: TouchEvent) => {
      const deltaX = e.changedTouches[0].clientX - startX;
      const deltaY = Math.abs(e.changedTouches[0].clientY - startY);
      const elapsed = Date.now() - startTime;

      // Swipe right from left edge: started within 30px of left, moved 60px+ right, mostly horizontal, under 400ms
      if (startX < 30 && deltaX > 60 && deltaY < 80 && elapsed < 400) {
        onSwipeBack();
      }
    };

    document.addEventListener('touchstart', onTouchStart, { passive: true });
    document.addEventListener('touchend', onTouchEnd, { passive: true });

    return () => {
      document.removeEventListener('touchstart', onTouchStart);
      document.removeEventListener('touchend', onTouchEnd);
    };
  }, [onSwipeBack]);
}
