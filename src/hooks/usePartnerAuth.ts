import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface PartnerShop {
  id: string;
  name: string;
  address: string | null;
  logo_url: string | null;
}

interface PartnerAuthState {
  isLoading: boolean;
  isPartner: boolean;
  isBarista: boolean;
  hasAccess: boolean;
  shops: PartnerShop[];
  selectedShopId: string | null;
  shopId: string | null;
  shopName: string | null;
  selectedShop: PartnerShop | null;
  role: 'partner' | 'barista' | null;
}

const STORAGE_KEY = 'partner_selected_shop_id';

export function usePartnerAuth() {
  const [state, setState] = useState<PartnerAuthState>({
    isLoading: true,
    isPartner: false,
    isBarista: false,
    hasAccess: false,
    shops: [],
    selectedShopId: null,
    shopId: null,
    shopName: null,
    selectedShop: null,
    role: null,
  });

  useEffect(() => {
    const checkPartnerAuth = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { setState(prev => ({ ...prev, isLoading: false })); return; }

        const { data: roles, error } = await supabase
          .from('user_roles')
          .select('role, shop_id')
          .eq('user_id', user.id)
          .in('role', ['partner', 'barista']);

        if (error || !roles || roles.length === 0) {
          setState(prev => ({ ...prev, isLoading: false }));
          return;
        }

        const partnerRoles = roles.filter(r => r.role === 'partner');
        const baristaRoles = roles.filter(r => r.role === 'barista');
        const hasPartner = partnerRoles.length > 0;

        const shopIds = [...new Set(roles.map(r => r.shop_id).filter(Boolean) as string[])];
        if (shopIds.length === 0) { setState(prev => ({ ...prev, isLoading: false })); return; }

        const { data: shopsData } = await supabase
          .from('shops')
          .select('id, name, address, logo_url')
          .in('id', shopIds);

        const shops: PartnerShop[] = shopsData || [];

        const savedId = localStorage.getItem(STORAGE_KEY);
        const selectedShopId = (savedId && shops.some(s => s.id === savedId)) ? savedId : shops[0]?.id || null;
        const selectedShop = shops.find(s => s.id === selectedShopId) || null;

        setState({
          isLoading: false,
          isPartner: hasPartner,
          isBarista: !hasPartner && baristaRoles.length > 0,
          hasAccess: true,
          shops,
          selectedShopId,
          shopId: selectedShopId,
          shopName: selectedShop?.name || null,
          selectedShop,
          role: hasPartner ? 'partner' : 'barista',
        });
      } catch (error) {
        console.error('Partner auth check error:', error);
        setState(prev => ({ ...prev, isLoading: false }));
      }
    };

    checkPartnerAuth();
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => checkPartnerAuth());
    return () => subscription.unsubscribe();
  }, []);

  const setSelectedShopId = useCallback((id: string) => {
    localStorage.setItem(STORAGE_KEY, id);
    window.location.reload();
  }, []);

  return { ...state, setSelectedShopId };
}
