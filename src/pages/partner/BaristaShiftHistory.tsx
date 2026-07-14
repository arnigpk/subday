import { useState, useEffect, useCallback } from 'react';
import { PartnerLayout } from '@/components/partner/PartnerLayout';
import { usePartnerAuth } from '@/hooks/usePartnerAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Coffee, CalendarDays, MapPin, ShoppingBag, Check } from 'lucide-react';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { BaristaAddressDialog } from '@/components/partner/BaristaAddressDialog';

interface HistoryItem {
  id: string;
  type: 'redemption' | 'preorder';
  customerName: string | null;
  customerPublicId: string | null;
  drinkName: string;
  subscriptionName: string | null;
  shopAddress: string | null;
  redeemedAt: string;
  status?: string;
  maxVolume?: string | null;
}

type DateFilter = 'today' | 'week' | 'month' | 'custom';

export default function BaristaShiftHistory() {
  const { shopId, isLoading: authLoading } = usePartnerAuth();
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [dateFilter, setDateFilter] = useState<DateFilter>('today');
  const [customDateFrom, setCustomDateFrom] = useState('');
  const [customDateTo, setCustomDateTo] = useState('');
  const [addressFilter, setAddressFilter] = useState('all');
  const [availableAddresses, setAvailableAddresses] = useState<string[]>([]);
  const [showAddressDialog, setShowAddressDialog] = useState(false);
  const [shopAddresses, setShopAddresses] = useState<string[]>([]);
  const [currentShiftAddress, setCurrentShiftAddress] = useState<string | null>(null);

  useEffect(() => {
    if (!shopId || authLoading) return;
    checkShiftAddress();
  }, [shopId, authLoading]);

  const checkShiftAddress = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: shop } = await supabase
        .from('shops')
        .select('addresses, address')
        .eq('id', shopId!)
        .maybeSingle();

      const addrs = shop?.addresses?.length ? shop.addresses : (shop?.address ? [shop.address] : []);
      setShopAddresses(addrs);

      const { data: shift } = await supabase
        .from('barista_shifts')
        .select('address, expires_at')
        .eq('user_id', user.id)
        .maybeSingle();

      if (shift && new Date(shift.expires_at) > new Date()) {
        setCurrentShiftAddress(shift.address);
      } else if (addrs.length <= 1) {
        // Один адрес — не спрашиваем, проставляем сам.
        const only = addrs[0] || null;
        if (only) {
          await supabase.from('barista_shifts').upsert({
            user_id: user.id, shop_id: shopId!, address: only,
            started_at: new Date().toISOString(),
            expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          }, { onConflict: 'user_id' });
          setCurrentShiftAddress(only);
        }
      } else {
        setShowAddressDialog(true);
      }
    } catch (e) {
      console.error('Shift check error:', e);
    }
  };

  const handleAddressSelected = (address: string) => {
    setCurrentShiftAddress(address);
    setShowAddressDialog(false);
  };

  const fetchHistory = useCallback(async () => {
    if (!shopId) return;
    setIsLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const now = new Date();
      let dateFrom: string | undefined;
      let dateTo: string | undefined;

      if (dateFilter === 'today') {
        dateFrom = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      } else if (dateFilter === 'week') {
        dateFrom = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
      } else if (dateFilter === 'month') {
        dateFrom = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
      } else if (dateFilter === 'custom') {
        if (customDateFrom) dateFrom = new Date(customDateFrom).toISOString();
        if (customDateTo) {
          const endDate = new Date(customDateTo);
          endDate.setDate(endDate.getDate() + 1);
          dateTo = endDate.toISOString();
        }
      }

      let rQuery = supabase
        .from('redemptions')
        .select('id, drink_name, subscription_name, redeemed_at, user_id, shop_address')
        .eq('shop_id', shopId)
        .eq('scanned_by', user.id)
        .order('redeemed_at', { ascending: false })
        .limit(200);
      if (dateFrom) rQuery = rQuery.gte('redeemed_at', dateFrom);
      if (dateTo) rQuery = rQuery.lt('redeemed_at', dateTo);

      let pQuery = supabase
        .from('preorders')
        .select('id, coffee_name, syrup, status, created_at, completed_at, user_id, shop_address, completed_by, subscription_name, max_volume')
        .eq('shop_id', shopId)
        .in('status', ['new', 'completed', 'expired'])
        .order('created_at', { ascending: false })
        .limit(200);

      if (currentShiftAddress) {
        pQuery = pQuery.eq('shop_address', currentShiftAddress);
      }
      if (dateFrom) pQuery = pQuery.gte('created_at', dateFrom);
      if (dateTo) pQuery = pQuery.lt('created_at', dateTo);

      // Fetch all subscription types upfront
      const [{ data: rData }, { data: pData }, { data: allSubTypes }] = await Promise.all([
        rQuery,
        pQuery,
        supabase.from('subscription_types').select('id, name, max_volume'),
      ]);

      const subTypeById = new Map<string, { name: string; maxVolume: string | null }>();
      const subTypeByName = new Map<string, { maxVolume: string | null }>();
      allSubTypes?.forEach(st => {
        subTypeById.set(st.id, { name: st.name, maxVolume: st.max_volume });
        subTypeByName.set(st.name, { maxVolume: st.max_volume });
      });

      const userIds = new Set<string>();
      rData?.forEach(r => userIds.add(r.user_id));
      pData?.forEach(p => userIds.add(p.user_id));

      let profileMap = new Map<string, any>();
      let userSubTypeId = new Map<string, string>();

      if (userIds.size > 0) {
        const uids = Array.from(userIds);
        const [{ data: profiles }, { data: userSubs }] = await Promise.all([
          supabase.from('profiles').select('user_id, name, public_id').in('user_id', uids),
          supabase.from('user_subscriptions')
            .select('user_id, subscription_type_id, created_at')
            .in('user_id', uids)
            .not('subscription_type_id', 'is', null)
            .order('created_at', { ascending: false }),
        ]);
        profileMap = new Map(profiles?.map(p => [p.user_id, p]) || []);
        userSubs?.forEach(us => {
          if (!userSubTypeId.has(us.user_id) && us.subscription_type_id) {
            userSubTypeId.set(us.user_id, us.subscription_type_id);
          }
        });
      }

      const addresses = new Set<string>();
      const combined: HistoryItem[] = [];

      rData?.forEach(r => {
        if (r.shop_address) addresses.add(r.shop_address);
        const userTypeId = userSubTypeId.get(r.user_id);
        const userType = userTypeId ? subTypeById.get(userTypeId) : null;
        const subName = r.subscription_name || userType?.name || null;
        const typeByName = subName ? subTypeByName.get(subName) : null;

        combined.push({
          id: r.id,
          type: 'redemption',
          customerName: profileMap.get(r.user_id)?.name || 'Неизвестный',
          customerPublicId: profileMap.get(r.user_id)?.public_id || null,
          drinkName: r.drink_name,
          subscriptionName: subName,
          shopAddress: r.shop_address || null,
          redeemedAt: r.redeemed_at,
          maxVolume: typeByName?.maxVolume ?? userType?.maxVolume ?? null,
        });
      });

      pData?.forEach((p: any) => {
        const drinkDesc = p.syrup ? `${p.coffee_name} + ${p.syrup}` : p.coffee_name;
        const addr = p.shop_address || null;
        if (addr) addresses.add(addr);
        const userTypeId = userSubTypeId.get(p.user_id);
        const userType = userTypeId ? subTypeById.get(userTypeId) : null;

        combined.push({
          id: p.id,
          type: 'preorder',
          customerName: profileMap.get(p.user_id)?.name || 'Неизвестный',
          customerPublicId: profileMap.get(p.user_id)?.public_id || null,
          drinkName: drinkDesc,
          subscriptionName: p.subscription_name || userType?.name || null,
          shopAddress: addr,
          redeemedAt: p.created_at,
          status: p.status,
          maxVolume: p.max_volume || userType?.maxVolume || null,
        });
      });

      setAvailableAddresses(Array.from(addresses).sort());
      combined.sort((a, b) => new Date(b.redeemedAt).getTime() - new Date(a.redeemedAt).getTime());

      let filtered = combined;
      if (addressFilter !== 'all') {
        filtered = filtered.filter(r => r.shopAddress === addressFilter);
      }

      setItems(filtered);
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setIsLoading(false);
    }
  }, [shopId, dateFilter, customDateFrom, customDateTo, addressFilter, currentShiftAddress]);

  useEffect(() => {
    if (!shopId || authLoading) return;
    fetchHistory();
  }, [shopId, authLoading, fetchHistory]);

  useEffect(() => {
    if (!shopId) return;
    const channel = supabase
      .channel(`barista-preorders-${shopId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'preorders', filter: `shop_id=eq.${shopId}` }, () => {
        fetchHistory();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [shopId, fetchHistory]);

  if (authLoading) {
    return (
      <PartnerLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </PartnerLayout>
    );
  }

  const filterButtons: { value: DateFilter; label: string }[] = [
    { value: 'today', label: 'Сегодня' },
    { value: 'week', label: 'Неделя' },
    { value: 'month', label: 'Месяц' },
    { value: 'custom', label: 'Произвольно' },
  ];

  const getItemIcon = (item: HistoryItem) => {
    if (item.type === 'preorder') {
      if (item.status === 'completed') return <Check size={20} className="text-accent" />;
      return <ShoppingBag size={20} className="text-amber-600" />;
    }
    return <Coffee size={20} className="text-primary" />;
  };

  const getStatusBadge = (item: HistoryItem) => {
    if (item.type === 'preorder') {
      if (item.status === 'completed') return { text: 'Выдан', className: 'bg-accent/10 text-accent' };
      if (item.status === 'expired') return { text: 'Закрыт', className: 'bg-muted text-muted-foreground' };
      return { text: 'Предзаказ', className: 'bg-amber-500/10 text-amber-600' };
    }
    return null;
  };

  return (
    <PartnerLayout>
      <div className="p-3 sm:p-4 space-y-4 max-w-full overflow-x-hidden">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <h2 className="text-lg sm:text-xl font-bold text-foreground">Моя смена</h2>
          {currentShiftAddress && (
            <button
              onClick={() => setShowAddressDialog(true)}
              className="text-xs text-primary flex items-center gap-1 hover:underline max-w-[60%] min-w-0"
            >
              <MapPin size={12} className="shrink-0" />
              <span className="truncate">{currentShiftAddress}</span>
            </button>
          )}
        </div>

        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <CalendarDays className="w-4 h-4 text-muted-foreground shrink-0" />
            {filterButtons.map((f) => (
              <Button
                key={f.value}
                variant={dateFilter === f.value ? 'default' : 'outline'}
                size="sm"
                className="text-xs sm:text-sm h-8 px-2.5 sm:px-3"
                onClick={() => setDateFilter(f.value)}
              >
                {f.label}
              </Button>
            ))}
          </div>
          {dateFilter === 'custom' && (
            <div className="flex items-center gap-2 flex-wrap">
              <Input type="date" value={customDateFrom} onChange={(e) => setCustomDateFrom(e.target.value)} className="flex-1 min-w-[130px] sm:flex-initial sm:w-36 h-8 text-sm" />
              <span className="text-sm text-muted-foreground">—</span>
              <Input type="date" value={customDateTo} onChange={(e) => setCustomDateTo(e.target.value)} className="flex-1 min-w-[130px] sm:flex-initial sm:w-36 h-8 text-sm" />
            </div>
          )}
        </div>

        {availableAddresses.length > 1 && (
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-muted-foreground" />
            <Select value={addressFilter} onValueChange={setAddressFilter}>
              <SelectTrigger className="w-full sm:w-64 h-8 text-sm">
                <SelectValue placeholder="Все адреса" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все адреса</SelectItem>
                {availableAddresses.map(addr => (
                  <SelectItem key={addr} value={addr}>{addr}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center h-32">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-secondary flex items-center justify-center">
              <Coffee size={32} className="text-muted-foreground" />
            </div>
            <p className="text-muted-foreground">
              {dateFilter === 'today' ? 'За сегодня пока нет записей' : 'Нет записей за выбранный период'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((item) => {
              const badge = getStatusBadge(item);
              return (
                <div key={`${item.type}-${item.id}`} className="bg-card p-3 sm:p-4 rounded-xl border border-border flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2.5 sm:gap-3 min-w-0 flex-1">
                    <div className={`w-9 h-9 sm:w-10 sm:h-10 shrink-0 rounded-full flex items-center justify-center ${
                      item.type === 'preorder'
                        ? item.status === 'completed' ? 'bg-accent/10' : 'bg-amber-500/10'
                        : 'bg-primary/10'
                    }`}>
                      {getItemIcon(item)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-foreground text-sm sm:text-base truncate">{item.customerName}</p>
                      {item.customerPublicId && (
                        <p className="text-xs text-muted-foreground font-mono truncate">ID: {item.customerPublicId}</p>
                      )}
                      <p className="text-xs sm:text-sm text-muted-foreground break-words">{item.drinkName}</p>
                      {item.shopAddress && (
                        <p className="text-xs text-muted-foreground flex items-start gap-1">
                          <MapPin size={10} className="shrink-0 mt-0.5" /><span className="truncate">{item.shopAddress}</span>
                        </p>
                      )}
                      {item.subscriptionName && (
                        <p className="text-xs text-primary truncate">{item.subscriptionName}</p>
                      )}
                      {item.maxVolume && (
                        <p className="text-xs text-muted-foreground">Макс. объём: {item.maxVolume}</p>
                      )}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    {badge && (
                      <div className={`text-[10px] sm:text-xs font-medium px-2 py-0.5 rounded-full mb-1 whitespace-nowrap ${badge.className}`}>
                        {badge.text}
                      </div>
                    )}
                    <p className="text-xs sm:text-sm font-medium text-foreground whitespace-nowrap">{format(new Date(item.redeemedAt), 'HH:mm')}</p>
                    <p className="text-[10px] sm:text-xs text-muted-foreground whitespace-nowrap">{format(new Date(item.redeemedAt), 'd MMM', { locale: ru })}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {shopAddresses.length > 0 && (
        <BaristaAddressDialog
          open={showAddressDialog}
          onSelect={handleAddressSelected}
          addresses={shopAddresses}
          shopId={shopId || ''}
        />
      )}
    </PartnerLayout>
  );
}
