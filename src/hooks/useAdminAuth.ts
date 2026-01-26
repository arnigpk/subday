import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Session } from '@supabase/supabase-js';

export type AppRole = 'admin' | 'moderator' | 'partner';

interface AdminAuthState {
  session: Session | null;
  isLoading: boolean;
  role: AppRole | null;
  shopId: string | null;
  isAdmin: boolean;
  isModerator: boolean;
  isPartner: boolean;
  hasAccess: boolean;
}

export function useAdminAuth(): AdminAuthState {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [role, setRole] = useState<AppRole | null>(null);
  const [shopId, setShopId] = useState<string | null>(null);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        if (session?.user) {
          setTimeout(() => {
            fetchUserRole(session.user.id);
          }, 0);
        } else {
          setRole(null);
          setShopId(null);
          setIsLoading(false);
        }
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session?.user) {
        fetchUserRole(session.user.id);
      } else {
        setIsLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchUserRole = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('user_roles')
        .select('role, shop_id')
        .eq('user_id', userId)
        .maybeSingle();

      if (error) {
        console.error('Error fetching user role:', error);
        setRole(null);
        setShopId(null);
      } else if (data) {
        setRole(data.role as AppRole);
        setShopId(data.shop_id);
      } else {
        setRole(null);
        setShopId(null);
      }
    } catch (err) {
      console.error('Error fetching user role:', err);
      setRole(null);
      setShopId(null);
    } finally {
      setIsLoading(false);
    }
  };

  const isAdmin = role === 'admin';
  const isModerator = role === 'moderator';
  const isPartner = role === 'partner';
  const hasAccess = isAdmin || isModerator || isPartner;

  return {
    session,
    isLoading,
    role,
    shopId,
    isAdmin,
    isModerator,
    isPartner,
    hasAccess,
  };
}
