import { useState, useEffect, useCallback } from 'react';
import { PartnerLayout } from '@/components/partner/PartnerLayout';
import { usePartnerAuth } from '@/hooks/usePartnerAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CalendarDaysIcon } from '@heroicons/react/24/outline';
import { Loader2, Coffee } from 'lucide-react';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';

interface Redemption {
  id: string;
  customerName: string | null;
  customerPublicId: string | null;
  drinkName: string;
  subscriptionName: string | null;
  redeemedAt: string;
}

type DateFilter = 'all' | 'today' | 'week' | 'month' | 'custom';

export default function PartnerHistoryPage() {
  const { shopId, isLoading: authLoading } = usePartnerAuth();
  const [redemptions, setRedemptions] = useState<Redemption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [dateFilter, setDateFilter] = useState<DateFilter>('all');
  const [customDateFrom, setCustomDateFrom] = useState('');
  const [customDateTo, setCustomDateTo] = useState('');

  const fetchHistory = useCallback(async () => {
    if (!shopId) return;
    setIsLoading(true);
    try {
      let query = supabase
        .from('redemptions')
        .select('id, drink_name, subscription_name, redeemed_at, user_id')
        .eq('shop_id', shopId)
        .order('redeemed_at', { ascending: false })
        .limit(200);

      // Date filter
      const now = new Date();
      if (dateFilter === 'today') {
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
        query = query.gte('redeemed_at', todayStart);
      } else if (dateFilter === 'week') {
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
        query = query.gte('redeemed_at', weekAgo);
      } else if (dateFilter === 'month') {
        const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
        query = query.gte('redeemed_at', monthAgo);
      } else if (dateFilter === 'custom') {
        if (customDateFrom) {
          query = query.gte('redeemed_at', new Date(customDateFrom).toISOString());
        }
        if (customDateTo) {
          const endDate = new Date(customDateTo);
          endDate.setDate(endDate.getDate() + 1);
          query = query.lt('redeemed_at', endDate.toISOString());
        }
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error fetching history:', error);
        setIsLoading(false);
        return;
      }

      if (!data || data.length === 0) {
        setRedemptions([]);
        setIsLoading(false);
        return;
      }

      const userIds = [...new Set(data.map(r => r.user_id))];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, name, public_id')
        .in('user_id', userIds);

      const profileMap = new Map(profiles?.map(p => [p.user_id, p]) || []);

      setRedemptions(data.map(r => ({
        id: r.id,
        customerName: profileMap.get(r.user_id)?.name || 'Неизвестный',
        customerPublicId: profileMap.get(r.user_id)?.public_id || null,
        drinkName: r.drink_name,
        subscriptionName: r.subscription_name,
        redeemedAt: r.redeemed_at,
      })));
    } catch (error) {
      console.error('Error fetching history:', error);
    } finally {
      setIsLoading(false);
    }
  }, [shopId, dateFilter, customDateFrom, customDateTo]);

  useEffect(() => {
    if (!shopId || authLoading) return;
    fetchHistory();
  }, [shopId, authLoading, fetchHistory]);

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
    { value: 'all', label: 'Все' },
    { value: 'today', label: 'Сегодня' },
    { value: 'week', label: 'Неделя' },
    { value: 'month', label: 'Месяц' },
    { value: 'custom', label: 'Произвольно' },
  ];

  return (
    <PartnerLayout>
      <div className="p-4 space-y-4">
        <h2 className="text-xl font-bold text-foreground">
          История покупок {redemptions.length > 0 && `(${redemptions.length})`}
        </h2>

        {/* Date filter */}
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <CalendarDaysIcon className="w-4 h-4 text-muted-foreground" />
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
              <Input
                type="date"
                value={customDateFrom}
                onChange={(e) => setCustomDateFrom(e.target.value)}
                className="w-36 h-8 text-sm"
              />
              <span className="text-sm text-muted-foreground">—</span>
              <Input
                type="date"
                value={customDateTo}
                onChange={(e) => setCustomDateTo(e.target.value)}
                className="w-36 h-8 text-sm"
              />
            </div>
          )}
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center h-32">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : redemptions.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-secondary flex items-center justify-center">
              <Coffee size={32} className="text-muted-foreground" />
            </div>
            <p className="text-muted-foreground">
              {dateFilter === 'all' ? 'История пока пуста' : 'Нет записей за выбранный период'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {redemptions.map((redemption) => (
              <div
                key={redemption.id}
                className="bg-card p-4 rounded-xl border border-border flex items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <Coffee size={20} className="text-primary" />
                  </div>
                  <div>
                    <p className="font-medium text-foreground">
                      {redemption.customerName}
                    </p>
                    {redemption.customerPublicId && (
                      <p className="text-xs text-muted-foreground font-mono">ID: {redemption.customerPublicId}</p>
                    )}
                    <p className="text-sm text-muted-foreground">
                      {redemption.drinkName}
                    </p>
                    {redemption.subscriptionName && (
                      <p className="text-xs text-primary">
                        {redemption.subscriptionName}
                      </p>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium text-foreground">
                    {format(new Date(redemption.redeemedAt), 'HH:mm')}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {format(new Date(redemption.redeemedAt), 'd MMM', { locale: ru })}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </PartnerLayout>
  );
}
