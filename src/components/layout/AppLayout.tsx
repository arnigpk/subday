import { ReactNode } from 'react';
import { BottomNav } from './BottomNav';

interface AppLayoutProps {
  children: ReactNode;
  hideNav?: boolean;
}

export function AppLayout({ children, hideNav = false }: AppLayoutProps) {
  return (
    <div className="min-h-screen bg-background overflow-x-hidden">
      <main className={`${hideNav ? 'pb-4' : 'pb-24'} safe-area-bottom`}>
        {children}
      </main>
      {!hideNav && <BottomNav />}
    </div>
  );
}
