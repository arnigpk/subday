import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface PartnerShop {
  id: string;
  name: string;
  address: string | null;
  logo_url: string | null;
  revenue_share_percent: number;
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

const EMPTY: PartnerAuthState = {
  isLoading: true, isPartner: false, isBarista: false, hasAccess: false,
  shops: [], selectedShopId: null, shopId: null, shopName: null, selectedShop: null, role: null,
};

// Модульный кэш: usePartnerAuth вызывается в ~10 компонентах кабинета (Layout +
// каждая страница). Раньше каждый инстанс на каждом переходе заново тянул
// getUser + user_roles + shops → кабинет тормозил. Теперь запрос выполняется
// ОДИН раз и переиспользуется всеми инстансами и при переключении вкладок.
let cached: PartnerAuthState | null = null;
let inflight: Promise<PartnerAuthState> | null = null;
const listeners = new Set<(s: PartnerAuthState) => void>();

function broadcast(s: PartnerAuthState) {
  cached = s;
  listeners.forEach(l => l(s));
}

async function fetchPartnerAuth(): Promise<PartnerAuthState> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { ...EMPTY, isLoading: false };

    const { data: roles, error } = await supabase
      .from('user_roles')
      .select('role, shop_id')
      .eq('user_id', user.id)
      .in('role', ['partner', 'barista']);

    if (error || !roles || roles.length === 0) return { ...EMPTY, isLoading: false };

    const hasPartner = roles.some(r => r.role === 'partner');
    const baristaCount = roles.filter(r => r.role === 'barista').length;
    const shopIds = [...new Set(roles.map(r => r.shop_id).filter(Boolean) as string[])];
    if (shopIds.length === 0) return { ...EMPTY, isLoading: false };

    const { data: shopsData } = await supabase
      .from('shops')
      .select('id, name, address, logo_url, revenue_share_percent')
      .in('id', shopIds);
    const shops: PartnerShop[] = shopsData || [];

    const savedId = localStorage.getItem(STORAGE_KEY);
    const selectedShopId = (savedId && shops.some(s => s.id === savedId)) ? savedId : shops[0]?.id || null;
    const selectedShop = shops.find(s => s.id === selectedShopId) || null;

    return {
      isLoading: false,
      isPartner: hasPartner,
      isBarista: !hasPartner && baristaCount > 0,
      hasAccess: true,
      shops,
      selectedShopId,
      shopId: selectedShopId,
      shopName: selectedShop?.name || null,
      selectedShop,
      role: hasPartner ? 'partner' : 'barista',
    };
  } catch (e) {
    console.error('Partner auth check error:', e);
    return { ...EMPTY, isLoading: false };
  }
}

function ensureLoaded(): Promise<PartnerAuthState> {
  if (cached) return Promise.resolve(cached);
  if (!inflight) {
    inflight = fetchPartnerAuth().then(s => { broadcast(s); inflight = null; return s; });
  }
  return inflight;
}

export function usePartnerAuth() {
  const [state, setState] = useState<PartnerAuthState>(cached ?? EMPTY);

  useEffect(() => {
    let mounted = true;
    const apply = (s: PartnerAuthState) => { if (mounted) setState(s); };
    listeners.add(apply);

    if (cached) apply(cached);
    else ensureLoaded();

    // Пересчитываем только на реальных сменах сессии (не на TOKEN_REFRESHED —
    // раньше это дёргало запросы каждый час у каждого инстанса).
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') {
        cached = null; inflight = null;
        ensureLoaded();
      }
    });

    return () => { mounted = false; listeners.delete(apply); subscription.unsubscribe(); };
  }, []);

  const setSelectedShopId = useCallback((id: string) => {
    localStorage.setItem(STORAGE_KEY, id);
    cached = null; inflight = null; // сбросить кэш перед перезагрузкой
    window.location.reload();
  }, []);

  return { ...state, setSelectedShopId };
}
