import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Session } from '@supabase/supabase-js';

export type AppRole = 'superadmin' | 'admin' | 'moderator' | 'partner' | 'barista' | 'investor';

interface AdminAuthState {
  session: Session | null;
  isLoading: boolean;
  role: AppRole | null;
  shopId: string | null;
  isSuperAdmin: boolean;
  isAdmin: boolean;
  isModerator: boolean;
  isPartner: boolean;
  isBarista: boolean;
  isInvestor: boolean;
  hasAccess: boolean;
  canManage: boolean; // true only for superadmin — full edit/add/delete rights
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
        .eq('user_id', userId);

      if (error) {
        console.error('Error fetching user role:', error);
        setRole(null);
        setShopId(null);
      } else if (data && data.length > 0) {
        // Priority: superadmin > admin > moderator > partner > barista
        const superadminRole = data.find(r => r.role === 'superadmin');
        const adminRole = data.find(r => r.role === 'admin');
        const moderatorRole = data.find(r => r.role === 'moderator');
        const partnerRole = data.find(r => r.role === 'partner');
        const baristaRole = data.find(r => r.role === 'barista');
        
        const activeRole = superadminRole || adminRole || moderatorRole || partnerRole || baristaRole;
        
        if (activeRole) {
          setRole(activeRole.role as AppRole);
          setShopId(activeRole.shop_id);
        } else {
          setRole(null);
          setShopId(null);
        }
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

  const isSuperAdmin = role === 'superadmin';
  const isAdmin = role === 'admin' || role === 'superadmin';
  const isModerator = role === 'moderator';
  const isPartner = role === 'partner';
  const isBarista = role === 'barista';
  const hasAccess = isAdmin || isModerator || isPartner || isBarista;
  const canManage = isSuperAdmin; // Only superadmin can add/edit/delete

  return {
    session,
    isLoading,
    role,
    shopId,
    isSuperAdmin,
    isAdmin,
    isModerator,
    isPartner,
    isBarista,
    hasAccess,
    canManage,
  };
}
