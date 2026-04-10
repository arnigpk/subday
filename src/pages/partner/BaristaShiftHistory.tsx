import { useState, useEffect, useCallback } from 'react';
import { PartnerLayout } from '@/components/partner/PartnerLayout';
import { usePartnerAuth } from '@/hooks/usePartnerAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Coffee, CalendarDays, MapPin, ShoppingBag, Check, XCircle } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';

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

      // Fetch redemptions (scanned by this barista)
      let rQuery = supabase
        .from('redemptions')
        .select('id, drink_name, subscription_name, redeemed_at, user_id, shop_address')
        .eq('shop_id', shopId)
        .eq('scanned_by', user.id)
        .order('redeemed_at', { ascending: false })
        .limit(200);
      if (dateFrom) rQuery = rQuery.gte('redeemed_at', dateFrom);
      if (dateTo) rQuery = rQuery.lt('redeemed_at', dateTo);

      // Fetch preorders for the shop
      let pQuery = supabase
        .from('preorders')
        .select('id, coffee_name, syrup, status, created_at, user_id')
        .eq('shop_id', shopId)
        .order('created_at', { ascending: false })
        .limit(200);
      if (dateFrom) pQuery = pQuery.gte('created_at', dateFrom);
      if (dateTo) pQuery = pQuery.lt('created_at', dateTo);

      const [{ data: rData }, { data: pData }] = await Promise.all([rQuery, pQuery]);

      const userIds = new Set<string>();
      rData?.forEach(r => userIds.add(r.user_id));
      pData?.forEach(p => userIds.add(p.user_id));

      let profileMap = new Map<string, any>();
      if (userIds.size > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('user_id, name, public_id')
          .in('user_id', Array.from(userIds));
        profileMap = new Map(profiles?.map(p => [p.user_id, p]) || []);
      }

      const addresses = new Set<string>();
      const combined: HistoryItem[] = [];

      rData?.forEach(r => {
        if (r.shop_address) addresses.add(r.shop_address);
        combined.push({
          id: r.id,
          type: 'redemption',
          customerName: profileMap.get(r.user_id)?.name || 'Неизвестный',
          customerPublicId: profileMap.get(r.user_id)?.public_id || null,
          drinkName: r.drink_name,
          subscriptionName: r.subscription_name,
          shopAddress: r.shop_address || null,
          redeemedAt: r.redeemed_at,
        });
      });

      pData?.forEach(p => {
        const drinkDesc = p.syrup ? `${p.coffee_name} + ${p.syrup}` : p.coffee_name;
        combined.push({
          id: p.id,
          type: 'preorder',
          customerName: profileMap.get(p.user_id)?.name || 'Неизвестный',
          customerPublicId: profileMap.get(p.user_id)?.public_id || null,
          drinkName: drinkDesc,
          subscriptionName: null,
          shopAddress: null,
          redeemedAt: p.created_at,
          status: p.status,
        });
      });

      setAvailableAddresses(Array.from(addresses).sort());
      combined.sort((a, b) => new Date(b.redeemedAt).getTime() - new Date(a.redeemedAt).getTime());

      let filtered = combined;
      if (addressFilter !== 'all') {
        filtered = filtered.filter(r => r.shopAddress === addressFilter || r.type === 'preorder');
      }

      setItems(filtered);
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setIsLoading(false);
    }
  }, [shopId, dateFilter, customDateFrom, customDateTo, addressFilter]);

  useEffect(() => {
    if (!shopId || authLoading) return;
    fetchHistory();
  }, [shopId, authLoading, fetchHistory]);

  // Realtime for preorders
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
      if (item.status === 'cancelled') return <XCircle size={20} className="text-destructive" />;
      if (item.status === 'completed') return <Check size={20} className="text-accent" />;
      return <ShoppingBag size={20} className="text-amber-600" />;
    }
    return <Coffee size={20} className="text-primary" />;
  };

  const getStatusBadge = (item: HistoryItem) => {
    if (item.type === 'preorder') {
      if (item.status === 'cancelled') return { text: 'Отменён', className: 'bg-destructive/10 text-destructive' };
      if (item.status === 'completed') return { text: 'Выдан', className: 'bg-accent/10 text-accent' };
      return { text: 'Предзаказ', className: 'bg-amber-500/10 text-amber-600' };
    }
    return null;
  };

  return (
    <PartnerLayout>
      <div className="p-4 space-y-4">
        <h2 className="text-xl font-bold text-foreground">Моя смена</h2>

        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <CalendarDays className="w-4 h-4 text-muted-foreground" />
            {filterButtons.map((f) => (
              <Button
                key={f.value}
                variant={dateFilter === f.value ? 'default' : 'outline'}
                size="sm"
                onClick={() => setDateFilter(f.value)}
              >
                {f.label}
              </Button>
            ))}
          </div>
          {dateFilter === 'custom' && (
            <div className="flex items-center gap-2 flex-wrap">
              <Input type="date" value={customDateFrom} onChange={(e) => setCustomDateFrom(e.target.value)} className="w-36 h-8 text-sm" />
              <span className="text-sm text-muted-foreground">—</span>
              <Input type="date" value={customDateTo} onChange={(e) => setCustomDateTo(e.target.value)} className="w-36 h-8 text-sm" />
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
                <div key={`${item.type}-${item.id}`} className="bg-card p-4 rounded-xl border border-border flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                      item.type === 'preorder'
                        ? item.status === 'cancelled' ? 'bg-destructive/10' : item.status === 'completed' ? 'bg-accent/10' : 'bg-amber-500/10'
                        : 'bg-primary/10'
                    }`}>
                      {getItemIcon(item)}
                    </div>
                    <div>
                      <p className="font-medium text-foreground">{item.customerName}</p>
                      {item.customerPublicId && (
                        <p className="text-xs text-muted-foreground font-mono">ID: {item.customerPublicId}</p>
                      )}
                      <p className="text-sm text-muted-foreground">{item.drinkName}</p>
                      {item.shopAddress && (
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <MapPin size={10} />{item.shopAddress}
                        </p>
                      )}
                      {item.subscriptionName && (
                        <p className="text-xs text-primary">{item.subscriptionName}</p>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    {badge && (
                      <div className={`text-xs font-medium px-2 py-0.5 rounded-full mb-1 ${badge.className}`}>
                        {badge.text}
                      </div>
                    )}
                    <p className="text-sm font-medium text-foreground">{format(new Date(item.redeemedAt), 'HH:mm')}</p>
                    <p className="text-xs text-muted-foreground">{format(new Date(item.redeemedAt), 'd MMM', { locale: ru })}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </PartnerLayout>
  );
}
