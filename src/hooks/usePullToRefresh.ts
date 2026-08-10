import { useState, useRef, useCallback, useEffect } from 'react';

interface UsePullToRefreshOptions {
  onRefresh: () => Promise<void> | void;
  threshold?: number;
  disabled?: boolean;
}

const isPullToRefreshLocked = () => document.body.dataset.pullToRefreshDisabled === 'true';

/**
 * Дольше этого крутиться не даём.
 *
 * Запросы к серверу ограничены 20 секундами — этого достаточно, чтобы данные не
 * ждали вечно, но для жеста рукой это целая вечность: на слабой связи человек
 * видел крутящийся кружок и решал, что приложение зависло. Здесь потолок свой,
 * короткий: жест завершается, а обновление, если оно ещё идёт, спокойно
 * доезжает фоном и подставит свежие данные само.
 */
export const REFRESH_SPINNER_CAP_MS = 8000;

export function withCap(p: Promise<void> | void, ms: number): Promise<void> {
  if (!(p instanceof Promise)) return Promise.resolve();
  // Отказ обновления не должен всплыть непойманным — гасим его здесь.
  p.catch(() => { /* обновление не удалось; данные останутся прежними */ });
  return new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms);
    p.finally(() => { clearTimeout(timer); resolve(); });
  });
}

export function usePullToRefresh({
  onRefresh,
  threshold = 80,
  disabled = false,
}: UsePullToRefreshOptions) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const [isPulling, setIsPulling] = useState(false);
  
  const containerRef = useRef<HTMLDivElement>(null);
  const startY = useRef(0);
  const currentY = useRef(0);
  const isAtTop = useRef(true);

  const resetPullState = useCallback(() => {
    setIsPulling(false);
    setPullDistance(0);
    startY.current = 0;
    currentY.current = 0;
  }, []);

  const handleTouchStart = useCallback((e: TouchEvent) => {
    if (disabled || isRefreshing || isPullToRefreshLocked()) return;
    
    const container = containerRef.current;
    if (!container) return;
    
    isAtTop.current = window.scrollY <= 0;
    
    if (isAtTop.current) {
      startY.current = e.touches[0].clientY;
      setIsPulling(true);
    }
  }, [disabled, isRefreshing]);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (disabled || isRefreshing || !isPulling || isPullToRefreshLocked()) return;
    if (!isAtTop.current) return;
    
    currentY.current = e.touches[0].clientY;
    const distance = currentY.current - startY.current;
    
    if (distance > 0 && window.scrollY <= 0) {
      const resistedDistance = Math.min(distance * 0.5, threshold * 1.5);
      setPullDistance(resistedDistance);
      
      if (distance > 10) {
        e.preventDefault();
      }
    }
  }, [disabled, isRefreshing, isPulling, threshold]);

  const handleTouchEnd = useCallback(async () => {
    if (isPullToRefreshLocked()) {
      resetPullState();
      return;
    }

    if (disabled || isRefreshing) return;
    
    setIsPulling(false);
    
    if (pullDistance >= threshold) {
      setIsRefreshing(true);
      setPullDistance(threshold);
      
      try {
        await withCap(onRefresh(), REFRESH_SPINNER_CAP_MS);
      } finally {
        setIsRefreshing(false);
        setPullDistance(0);
      }
    } else {
      setPullDistance(0);
    }
    
    startY.current = 0;
    currentY.current = 0;
  }, [disabled, isRefreshing, pullDistance, threshold, onRefresh, resetPullState]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    
    document.addEventListener('touchstart', handleTouchStart, { passive: true });
    document.addEventListener('touchmove', handleTouchMove, { passive: false });
    document.addEventListener('touchend', handleTouchEnd, { passive: true });
    
    return () => {
      document.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleTouchEnd);
    };
  }, [handleTouchStart, handleTouchMove, handleTouchEnd]);

  return {
    containerRef,
    isRefreshing,
    pullDistance,
    isPulling,
    threshold,
  };
}
