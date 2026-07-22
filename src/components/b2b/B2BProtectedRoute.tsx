import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useB2BAuth } from '@/hooks/useB2BAuth';
import { Loader2 } from 'lucide-react';

export function B2BProtectedRoute({ children }: { children: ReactNode }) {
  const { isLoading, isB2BAdmin } = useB2BAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }
  if (!isB2BAdmin) return <Navigate to="/" replace />;
  return <>{children}</>;
}
