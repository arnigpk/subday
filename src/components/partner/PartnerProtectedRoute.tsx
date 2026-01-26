import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { usePartnerAuth } from '@/hooks/usePartnerAuth';
import { Loader2 } from 'lucide-react';

interface PartnerProtectedRouteProps {
  children: ReactNode;
  allowBarista?: boolean;
}

export function PartnerProtectedRoute({ children, allowBarista = true }: PartnerProtectedRouteProps) {
  const { isLoading, hasAccess, isPartner, isBarista } = usePartnerAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!hasAccess) {
    return <Navigate to="/" replace />;
  }

  // If page requires partner only and user is barista
  if (!allowBarista && isBarista && !isPartner) {
    return <Navigate to="/partner/scan" replace />;
  }

  return <>{children}</>;
}
