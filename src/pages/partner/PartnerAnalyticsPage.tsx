import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PartnerLayout } from '@/components/partner/PartnerLayout';
import { usePartnerAuth } from '@/hooks/usePartnerAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { BarChart3, Users, UserPlus, RefreshCw, Coffee, UtensilsCrossed, TrendingUp, Repeat, Clock, CalendarDays } from 'lucide-react';

interface Analytics {
  total: number;
  unique_guests: number;
  new_guests: number;
  returning_guests: number;
  drinks_cnt: number;
  lunch_cnt: number;
  avg_per_day: number;
  visits_per_guest: number;
  by_hour: { h: number; c: number }[];
  by_dow: { d: number; c: number }[];
  by_tier: { name: string; c: number }[];
}

const PERIODS = [
  { days: 7, label: '7 дней' },
  { days: 30, label: '30 дней' },
  { days: 90, label: '90 дней' },
];

const DOW_LABELS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

function Metric({ icon, label, value, hint, accent }: {
  icon: React.ReactNode; label: string; value: string; hint?: string; accent?: boolean;
}) {
  return (
    <div className={`rounded-xl p-3 ${accent ? 'bg-primary/10' : 'bg-secondary/50'}`}>
      <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
        {icon}<span className="text-[11px] leading-tight">{label}</span>
      </div>
      <p className={`font-bold ${accent ? 'text-lg text-primary' : 'text-base text-foreground'}`}>{value}</p>
      {hint && <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">{hint}</p>}
    </div>
  );
}

// Простая столбчатая диаграмма на CSS — без тяжёлых библиотек.
function BarChart({ data, labels }: { data: number[]; labels: string[] }) {
  const max = Math.max(1, ...data);
  return (
    <div className="flex items-end gap-[3px] h-28">
      {data.map((v, i) => (
        <div key={i} className="flex-1 flex flex-col items-center justify-end gap-1 min-w-0">
          <div className="w-full rounded-t bg-primary/70" style={{ height: `${(v / max) * 100}%`, minHeight: v > 0 ? '3px' : '0' }} title={`${labels[i]}: ${v}`} />
          <span className="text-[9px] text-muted-foreground truncate w-full text-center">{labels[i]}</span>
        </div>
      ))}
    </div>
  );
}

export default function PartnerAnalyticsPage() {
  const { shopId, shopName, isLoading: authLoading } = usePartnerAuth();
  const [days, setDays] = useState(30);

  const { data, isLoading, error } = useQuery({
    queryKey: ['shop-analytics', shopId, days],
    queryFn: async () => {
      const to = new Date().toISOString();
      const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase.rpc('get_shop_analytics', { p_shop_id: shopId, p_from: from, p_to: to });
      if (error) throw error;
      return data as unknown as Analytics;
    },
    enabled: !!shopId,
  });

  const convRate = data && data.unique_guests > 0
    ? Math.round((data.returning_guests / data.unique_guests) * 100) : 0;

  // Пиковые часы: показываем рабочий диапазон 7:00–23:00, чтобы не растягивать ночью.
  const hours = (data?.by_hour || []).filter(h => h.h >= 7 && h.h <= 23);

  return (
    <PartnerLayout>
      <div className="p-4 space-y-4">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-11 h-11 rounded-2xl bg-primary/15 flex items-center justify-center">
            <BarChart3 size={22} className="text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-foreground">Аналитика</h2>
            <p className="text-xs text-muted-foreground">{shopName || 'Ваша кофейня'} · реальные списания</p>
          </div>
        </div>

        <div className="flex gap-2">
          {PERIODS.map(p => (
            <Button key={p.days} size="sm" variant={days === p.days ? 'default' : 'outline'} onClick={() => setDays(p.days)}>
              {p.label}
            </Button>
          ))}
        </div>

        {authLoading || isLoading ? (
          <Skeleton className="h-64 w-full" />
        ) : error ? (
          <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Не удалось загрузить аналитику. Попробуйте позже.</p></CardContent></Card>
        ) : !data || data.total === 0 ? (
          <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">За выбранный период списаний не было.</p></CardContent></Card>
        ) : (
          <>
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base">Гости и визиты</CardTitle></CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-2">
                  <Metric accent icon={<Users size={13} />} label="Всего списаний" value={data.total.toLocaleString('ru-RU')} />
                  <Metric icon={<Users size={13} />} label="Уникальных гостей" value={data.unique_guests.toLocaleString('ru-RU')} />
                  <Metric icon={<UserPlus size={13} />} label="Новых гостей" value={data.new_guests.toLocaleString('ru-RU')} hint="Раньше у вас не были" />
                  <Metric icon={<RefreshCw size={13} />} label="Вернувшихся" value={data.returning_guests.toLocaleString('ru-RU')} hint={`${convRate}% возвращаются`} />
                  <Metric icon={<TrendingUp size={13} />} label="В среднем в день" value={data.avg_per_day.toLocaleString('ru-RU')} hint="Списаний за сутки" />
                  <Metric icon={<Repeat size={13} />} label="Визитов на гостя" value={data.visits_per_guest.toLocaleString('ru-RU')} hint="Как часто возвращаются" />
                  <Metric icon={<Coffee size={13} />} label="Напитки" value={data.drinks_cnt.toLocaleString('ru-RU')} />
                  <Metric icon={<UtensilsCrossed size={13} />} label="Ланч" value={data.lunch_cnt.toLocaleString('ru-RU')} hint={data.lunch_cnt === 0 ? 'Появится с запуском ланча' : undefined} />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2"><Clock size={16} className="text-primary" />Часы пик</CardTitle>
                <p className="text-xs text-muted-foreground">Когда к вам чаще всего приходят (время Алматы)</p>
              </CardHeader>
              <CardContent>
                <BarChart data={hours.map(h => h.c)} labels={hours.map(h => String(h.h))} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2"><CalendarDays size={16} className="text-primary" />По дням недели</CardTitle>
              </CardHeader>
              <CardContent>
                <BarChart
                  data={DOW_LABELS.map((_, i) => data.by_dow.find(d => d.d === i + 1)?.c || 0)}
                  labels={DOW_LABELS}
                />
              </CardContent>
            </Card>

            {data.by_tier.length > 0 && (
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-base">Какие тарифы к вам ходят</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                  {data.by_tier.map((t, i) => {
                    const max = data.by_tier[0].c || 1;
                    return (
                      <div key={i} className="flex items-center gap-2">
                        <span className="text-xs text-foreground w-32 truncate shrink-0">{t.name}</span>
                        <div className="flex-1 h-4 bg-secondary/50 rounded overflow-hidden">
                          <div className="h-full bg-primary/70 rounded" style={{ width: `${(t.c / max) * 100}%` }} />
                        </div>
                        <span className="text-xs font-medium text-foreground w-8 text-right">{t.c}</span>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            )}

            <p className="text-[10px] text-muted-foreground leading-relaxed">
              Все цифры — реальные списания в вашей кофейне. «Новый гость» — тот, кто раньше
              у вас не списывал ни разу. Один человек считается один раз.
            </p>
          </>
        )}
      </div>
    </PartnerLayout>
  );
}
