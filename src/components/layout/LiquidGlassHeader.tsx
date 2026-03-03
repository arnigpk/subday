import { ReactNode } from 'react';

interface LiquidGlassHeaderProps {
  children: ReactNode;
  className?: string;
  sticky?: boolean;
}

export function LiquidGlassHeader({ children, className = '', sticky = true }: LiquidGlassHeaderProps) {
  return (
    <div className={`${sticky ? 'sticky top-0 z-30' : ''} liquid-glass-header safe-area-top ${className}`}>
      {children}
    </div>
  );
}
