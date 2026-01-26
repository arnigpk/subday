import { useState, useEffect } from 'react';
import { PartnerLayout } from '@/components/partner/PartnerLayout';
import { usePartnerAuth } from '@/hooks/usePartnerAuth';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Coffee, TrendingUp, Clock, Star, Loader2 } from 'lucide-react';
import { format, startOfDay, subDays } from 'date-fns';
import { ru } from 'date-fns/locale';

interface Stats {
  today: number;
  week: number;
  popularDrink: string | null;
  peakHour: string | null;
}

export default function PartnerDashboard() {
  const { shopId, isLoading: authLoading } = usePartnerAuth();
  const [stats, setStats] = useState<Stats>({
    today: 0,
    week: 0,
    popularDrink: null,
    peakHour: null,
  });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!shopId || authLoading) return;

    const fetchStats = async () => {
      try {
        const today = startOfDay(new Date()).toISOString();
        const weekAgo = subDays(new Date(), 7).toISOString();

        // Fetch today's redemptions
        const { count: todayCount } = await supabase
          .from('redemptions')
          .select('*', { count: 'exact', head: true })
          .eq('shop_id', shopId)
          .gte('redeemed_at', today);

        // Fetch week's redemptions
        const { count: weekCount } = await supabase
          .from('redemptions')
          .select('*', { count: 'exact', head: true })
          .eq('shop_id', shopId)
          .gte('redeemed_at', weekAgo);

        // Fetch popular drink (last 30 days)
        const { data: drinks } = await supabase
          .from('redemptions')
          .select('drink_name')
          .eq('shop_id', shopId)
          .gte('redeemed_at', subDays(new Date(), 30).toISOString());

        let popularDrink: string | null = null;
        if (drinks && drinks.length > 0) {
          const drinkCounts: Record<string, number> = {};
          drinks.forEach(d => {
            drinkCounts[d.drink_name] = (drinkCounts[d.drink_name] || 0) + 1;
          });
          const sorted = Object.entries(drinkCounts).sort((a, b) => b[1] - a[1]);
          popularDrink = sorted[0]?.[0] || null;
        }

        // Fetch peak hour (last 7 days)
        const { data: hourlyData } = await supabase
          .from('redemptions')
          .select('redeemed_at')
          .eq('shop_id', shopId)
          .gte('redeemed_at', weekAgo);

        let peakHour: string | null = null;
        if (hourlyData && hourlyData.length > 0) {
          const hourCounts: Record<number, number> = {};
          hourlyData.forEach(r => {
            const hour = new Date(r.redeemed_at).getHours();
            hourCounts[hour] = (hourCounts[hour] || 0) + 1;
          });
          const sorted = Object.entries(hourCounts).sort((a, b) => b[1] - a[1]);
          const peak = sorted[0]?.[0];
          if (peak !== undefined) {
            peakHour = `${peak}:00 - ${parseInt(peak) + 1}:00`;
          }
        }

        setStats({
          today: todayCount || 0,
          week: weekCount || 0,
          popularDrink,
          peakHour,
        });
      } catch (error) {
        console.error('Error fetching stats:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchStats();
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
        <h2 className="text-xl font-bold text-foreground">Статистика</h2>

        <div className="grid grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Coffee size={16} />
                Сегодня
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-foreground">{stats.today}</p>
              <p className="text-xs text-muted-foreground">напитков</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <TrendingUp size={16} />
                За неделю
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-foreground">{stats.week}</p>
              <p className="text-xs text-muted-foreground">напитков</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Star size={16} />
                Популярный напиток
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-lg font-bold text-foreground">
                {stats.popularDrink || '—'}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Clock size={16} />
                Пиковое время
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-lg font-bold text-foreground">
                {stats.peakHour || '—'}
              </p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Сегодня</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              {format(new Date(), "d MMMM yyyy, EEEE", { locale: ru })}
            </p>
          </CardContent>
        </Card>
      </div>
    </PartnerLayout>
  );
}
