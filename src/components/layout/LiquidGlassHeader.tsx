import { ReactNode } from 'react';
import { useScrollDirection } from '@/hooks/useScrollDirection';

interface LiquidGlassHeaderProps {
  children: ReactNode;
  className?: string;
  sticky?: boolean;
  hideOnScroll?: boolean;
}

export function LiquidGlassHeader({ children, className = '', sticky = true, hideOnScroll = true }: LiquidGlassHeaderProps) {
  const isVisible = useScrollDirection(8);
  const shouldHide = hideOnScroll && !isVisible;

  return (
    <div
      className={`${sticky ? 'sticky top-0 z-30' : ''} liquid-glass-header safe-area-top ${className}`}
      style={{
        transform: shouldHide ? 'translateY(-100%)' : 'translateY(0)',
        transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
      }}
    >
      {children}
    </div>
  );
}
