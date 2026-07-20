import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { UserPlus, Footprints, Clock, Coins, Target } from 'lucide-react';

interface AdPerformanceRow {
  ad_kind: string;
  ad_id: string;
  ad_title: string | null;
  views: number;
  clicks: number;
  reach: number;
  ctr: number;
  conv_users_7d: number;
  conv_users_14d: number;
  new_guests_7d: number;
  new_guests_14d: number;
  conv_post_click: number;
  conv_post_view: number;
  visits_14d: number;
  revenue_14d: number;
  avg_hours_to_visit: number | null;
  conv_rate_14d: number;
  views_a: number;
  clicks_a: number;
  views_b: number;
  clicks_b: number;
  ctr_a: number;
  ctr_b: number;
  conv_a: number;
  conv_b: number;
}

interface Props {
  shopId: string | null;
}

const money = (v: number) => `${Math.round(v).toLocaleString('ru-RU')} ₸`;

function Metric({ icon, label, value, hint, accent }: {
  icon: React.ReactNode; label: string; value: string; hint?: string; accent?: boolean;
}) {
  return (
    <div className={`rounded-xl p-3 ${accent ? 'bg-primary/10' : 'bg-secondary/50'}`}>
      <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
        {icon}
        <span className="text-[11px] leading-tight">{label}</span>
      </div>
      <p className={`font-bold ${accent ? 'text-lg text-primary' : 'text-base text-foreground'}`}>{value}</p>
      {hint && <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">{hint}</p>}
    </div>
  );
}

/**
 * Результат рекламы в живых людях, а не в показах: сколько человек после
 * рекламы реально дошли до кофейни и списали напиток.
 */
export function PartnerAdResults({ shopId }: Props) {
  const { data: rows = [], isLoading, error } = useQuery({
    queryKey: ['partner-ad-performance', shopId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_ad_performance', {
        p_shop_id: shopId,
      });
      if (error) throw error;
      return (data || []) as unknown as AdPerformanceRow[];
    },
    enabled: !!shopId,
  });

  if (!shopId) return null;

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Результат рекламы</CardTitle>
        </CardHeader>
        <CardContent><Skeleton className="h-24 w-full" /></CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Результат рекламы</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Не удалось загрузить статистику. Попробуйте позже.</p>
        </CardContent>
      </Card>
    );
  }

  const withData = rows.filter(r => r.views > 0);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Target size={18} className="text-primary" />
          Результат рекламы
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Сколько людей после рекламы дошли до кофейни и списали напиток
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {withData.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Пока нет данных. Метрики появятся, когда реклама начнёт показываться.
          </p>
        ) : withData.map(r => (
          <div key={`${r.ad_kind}:${r.ad_id}`} className="rounded-2xl border border-border p-3 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <p className="font-semibold text-sm text-foreground">{r.ad_title || 'Без названия'}</p>
              <Badge variant="secondary" className="text-[10px] shrink-0">
                {r.ad_kind === 'banner' ? 'Баннер' : 'SubFlow'}
              </Badge>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Metric
                accent
                icon={<UserPlus size={13} />}
                label="Новых гостей за 14 дней"
                value={String(r.new_guests_14d)}
                hint={`За 7 дней — ${r.new_guests_7d}. Раньше в кофейне не были`}
              />
              <Metric
                icon={<Footprints size={13} />}
                label="Всего дошли до кофейни"
                value={String(r.conv_users_14d)}
                hint={`${r.conv_rate_14d}% от увидевших; за 7 дней — ${r.conv_users_7d}`}
              />
              <Metric
                icon={<Clock size={13} />}
                label="Средний срок до визита"
                value={r.avg_hours_to_visit != null ? `${Math.round(r.avg_hours_to_visit / 24 * 10) / 10} дн.` : '—'}
              />
              <Metric
                icon={<Coins size={13} />}
                label="Визитов от пришедших"
                value={String(r.visits_14d)}
                hint={r.revenue_14d > 0 ? `на ${money(r.revenue_14d)}` : undefined}
              />
            </div>

            {/* Сравнение креативов показываем только если A/B реально идёт */}
            {r.views_b > 0 && (
              <div className="rounded-xl bg-secondary/50 p-2.5">
                <p className="text-[11px] font-semibold text-foreground mb-1.5">Сравнение вариантов</p>
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  {([
                    ['Вариант A', r.views_a, r.clicks_a, r.ctr_a, r.conv_a],
                    ['Вариант B', r.views_b, r.clicks_b, r.ctr_b, r.conv_b],
                  ] as const).map(([label, v, c, ctr, conv]) => (
                    <div key={label} className="rounded-lg bg-background/60 p-2">
                      <p className="font-semibold text-foreground">{label}</p>
                      <p className="text-muted-foreground">Показы: <b className="text-foreground">{v}</b></p>
                      <p className="text-muted-foreground">Клики: <b className="text-foreground">{c}</b> ({ctr}%)</p>
                      <p className="text-muted-foreground">Дошли: <b className="text-foreground">{conv}</b></p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
              <span>Показы: <b className="text-foreground">{r.views.toLocaleString('ru-RU')}</b></span>
              <span>Охват: <b className="text-foreground">{r.reach.toLocaleString('ru-RU')}</b></span>
              <span>Клики: <b className="text-foreground">{r.clicks}</b> ({r.ctr}%)</span>
              <span>После клика: <b className="text-foreground">{r.conv_post_click}</b></span>
              <span>После показа: <b className="text-foreground">{r.conv_post_view}</b></span>
            </div>
          </div>
        ))}

        <p className="text-[10px] text-muted-foreground leading-relaxed">
          Считаем так: человек увидел или нажал рекламу, а затем в течение 14 дней пришёл
          и списал напиток именно в вашей кофейне. Один человек считается один раз, даже если
          заходил потом много раз, — повторные приходы показаны отдельно как «визиты».
        </p>
      </CardContent>
    </Card>
  );
}
