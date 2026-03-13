import { ReactNode } from 'react';
import { useAdminAuth } from '@/hooks/useAdminAuth';

interface InvestorProtectedRouteProps {
  children: ReactNode;
}

export function InvestorProtectedRoute({ children }: InvestorProtectedRouteProps) {
  const { isLoading, role } = useAdminAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (role !== 'investor' && role !== 'superadmin') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="text-center space-y-2">
          <h1 className="text-xl font-bold">Доступ запрещён</h1>
          <p className="text-muted-foreground">У вас нет доступа к кабинету инвестора</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
