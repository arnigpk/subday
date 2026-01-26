import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAdminAuth, AppRole } from '@/hooks/useAdminAuth';
import { Loader2 } from 'lucide-react';

interface AdminProtectedRouteProps {
  children: ReactNode;
  allowedRoles?: AppRole[];
}

export function AdminProtectedRoute({ children, allowedRoles }: AdminProtectedRouteProps) {
  const { session, isLoading, role, hasAccess } = useAdminAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/" replace />;
  }

  if (!hasAccess) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center p-8">
          <h1 className="text-2xl font-bold text-foreground mb-2">Доступ запрещён</h1>
          <p className="text-muted-foreground mb-4">
            У вас нет прав для просмотра этой страницы
          </p>
          <a href="/" className="text-primary hover:underline">
            Вернуться на главную
          </a>
        </div>
      </div>
    );
  }

  if (allowedRoles && role && !allowedRoles.includes(role)) {
    return <Navigate to="/admin" replace />;
  }

  return <>{children}</>;
}
