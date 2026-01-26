import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface PartnerAuthState {
  isLoading: boolean;
  isPartner: boolean;
  isBarista: boolean;
  hasAccess: boolean;
  shopId: string | null;
  shopName: string | null;
  role: 'partner' | 'barista' | null;
}

export function usePartnerAuth() {
  const [state, setState] = useState<PartnerAuthState>({
    isLoading: true,
    isPartner: false,
    isBarista: false,
    hasAccess: false,
    shopId: null,
    shopName: null,
    role: null,
  });

  useEffect(() => {
    const checkPartnerAuth = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        
        if (!user) {
          setState(prev => ({ ...prev, isLoading: false }));
          return;
        }

        // Check user roles for partner or barista
        const { data: roles, error } = await supabase
          .from('user_roles')
          .select('role, shop_id')
          .eq('user_id', user.id)
          .in('role', ['partner', 'barista']);

        if (error) {
          console.error('Error fetching user roles:', error);
          setState(prev => ({ ...prev, isLoading: false }));
          return;
        }

        if (!roles || roles.length === 0) {
          setState(prev => ({ ...prev, isLoading: false }));
          return;
        }

        // Prefer partner role if user has both
        const partnerRole = roles.find(r => r.role === 'partner');
        const baristaRole = roles.find(r => r.role === 'barista');
        const activeRole = partnerRole || baristaRole;

        if (!activeRole || !activeRole.shop_id) {
          setState(prev => ({ ...prev, isLoading: false }));
          return;
        }

        // Get shop name
        const { data: shop } = await supabase
          .from('shops')
          .select('name')
          .eq('id', activeRole.shop_id)
          .maybeSingle();

        setState({
          isLoading: false,
          isPartner: !!partnerRole,
          isBarista: !!baristaRole && !partnerRole,
          hasAccess: true,
          shopId: activeRole.shop_id,
          shopName: shop?.name || null,
          role: partnerRole ? 'partner' : 'barista',
        });
      } catch (error) {
        console.error('Partner auth check error:', error);
        setState(prev => ({ ...prev, isLoading: false }));
      }
    };

    checkPartnerAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      checkPartnerAuth();
    });

    return () => subscription.unsubscribe();
  }, []);

  return state;
}
