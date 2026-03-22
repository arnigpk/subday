import { ReactNode, useCallback } from 'react';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { Loader2, ArrowDown } from 'lucide-react';

interface PullToRefreshProps {
  children: ReactNode;
  onRefresh: () => Promise<void> | void;
  disabled?: boolean;
}

export function PullToRefresh({ children, onRefresh, disabled = false }: PullToRefreshProps) {
  const {
    containerRef,
    isRefreshing,
    pullDistance,
    threshold,
  } = usePullToRefresh({
    onRefresh,
    threshold: 80,
    disabled,
  });

  const progress = Math.min(pullDistance / threshold, 1);
  const shouldShowIndicator = pullDistance > 10 || isRefreshing;
  const isReady = pullDistance >= threshold;

  return (
    <div ref={containerRef} className="relative">
      {/* Pull indicator */}
      <div 
        className="absolute left-0 right-0 flex items-center justify-center z-50 pointer-events-none overflow-hidden"
        style={{
          top: 0,
          height: shouldShowIndicator ? Math.max(pullDistance, isRefreshing ? 60 : 0) : 0,
          opacity: shouldShowIndicator ? 1 : 0,
          transition: isRefreshing ? 'height 0.3s ease' : 'none',
        }}
      >
        <div 
          className={`flex items-center justify-center w-10 h-10 rounded-full bg-card shadow-lg border border-border transition-all duration-200 ${
            isReady || isRefreshing ? 'scale-100' : 'scale-75'
          }`}
          style={{
            transform: `rotate(${isRefreshing ? 0 : progress * 180}deg)`,
          }}
        >
          {isRefreshing ? (
            <Loader2 size={20} className="text-primary animate-spin" />
          ) : (
            <ArrowDown 
              size={20} 
              className={`transition-colors duration-200 ${
                isReady ? 'text-primary' : 'text-muted-foreground'
              }`}
              style={{
                transform: `rotate(${isReady ? 180 : 0}deg)`,
                transition: 'transform 0.2s ease',
              }}
            />
          )}
        </div>
      </div>

      {/* Content with transform */}
      <div
        style={{
          transform: `translateY(${shouldShowIndicator ? Math.max(pullDistance, isRefreshing ? 60 : 0) : 0}px)`,
          transition: isRefreshing || pullDistance === 0 ? 'transform 0.3s ease' : 'none',
        }}
      >
        {children}
      </div>
    </div>
  );
}
