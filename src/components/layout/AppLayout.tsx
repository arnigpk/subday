import { ReactNode } from 'react';
import { BottomNav } from './BottomNav';
import { useNavigate } from 'react-router-dom';
import { useSwipeBack } from '@/hooks/useSwipeBack';

interface AppLayoutProps {
  children: ReactNode;
  hideNav?: boolean;
}

export function AppLayout({ children, hideNav = false }: AppLayoutProps) {
  const navigate = useNavigate();
  useSwipeBack(() => navigate(-1));

  return (
    <div className="min-safe-screen bg-background overflow-x-hidden flex flex-col">
      <main className={`flex-1 min-w-0 ${hideNav ? 'app-content-no-nav' : 'app-content-with-nav'}`}>
        {children}
      </main>
      {!hideNav && <BottomNav />}
    </div>
  );
}
