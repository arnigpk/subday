import { useState, useEffect } from 'react';
import { PartnerLayout } from '@/components/partner/PartnerLayout';
import { usePartnerAuth } from '@/hooks/usePartnerAuth';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, Coffee } from 'lucide-react';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';

interface Redemption {
  id: string;
  customerName: string | null;
  drinkName: string;
  redeemedAt: string;
}

export default function PartnerHistoryPage() {
  const { shopId, isLoading: authLoading } = usePartnerAuth();
  const [redemptions, setRedemptions] = useState<Redemption[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!shopId || authLoading) return;

    const fetchHistory = async () => {
      try {
        // Fetch redemptions for this shop
        const { data, error } = await supabase
          .from('redemptions')
          .select(`
            id,
            drink_name,
            redeemed_at,
            user_id
          `)
          .eq('shop_id', shopId)
          .order('redeemed_at', { ascending: false })
          .limit(100);

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

        // Fetch profiles for all user_ids
        const userIds = [...new Set(data.map(r => r.user_id))];
        const { data: profiles } = await supabase
          .from('profiles')
          .select('user_id, name')
          .in('user_id', userIds);

        const profileMap = new Map(profiles?.map(p => [p.user_id, p.name]) || []);

        const formattedRedemptions: Redemption[] = data.map(r => ({
          id: r.id,
          customerName: profileMap.get(r.user_id) || 'Неизвестный',
          drinkName: r.drink_name,
          redeemedAt: r.redeemed_at,
        }));

        setRedemptions(formattedRedemptions);
      } catch (error) {
        console.error('Error fetching history:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchHistory();
  }, [shopId, authLoading]);

  if (authLoading || isLoading) {
    return (
      <PartnerLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </PartnerLayout>
    );
  }

  return (
    <PartnerLayout>
      <div className="p-4 space-y-4">
        <h2 className="text-xl font-bold text-foreground">История покупок</h2>

        {redemptions.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-secondary flex items-center justify-center">
              <Coffee size={32} className="text-muted-foreground" />
            </div>
            <p className="text-muted-foreground">История пока пуста</p>
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
                    <p className="text-sm text-muted-foreground">
                      {redemption.drinkName}
                    </p>
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
