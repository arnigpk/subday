import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { Users, UserPlus, RefreshCw, Banknote, CreditCard, CalendarDays, Info, Gift, TrendingUp } from 'lucide-react';

interface Finance {
  active_now: number;
  activations_total: number;
  unique_buyers: number;
  new_users: number;
  monthly_activations: { m: string; total: number; new: number }[];
  by_source: { source: string; c: number }[];
  by_tier: { name: string; c: number }[];
  renewal: { expired: number; renewed: number; rate_pct: number | null };
  revenue: {
    accounting_since: string | null;
    total: number; count: number;
    monthly: { m: string; sum: number; n: number }[];
    by_method: { method: string; sum: number; n: number }[];
    special_offer: { sum: number; n: number };
  };
}

const SOURCE_LABELS: Record<string, string> = {
  purchase: 'Покупки',
  purchase_special: 'Спецоффер',
  admin: 'Админ-выдачи',
  b2b: 'B2B',
  signup: 'Тест-регистрации',
  unknown: 'До учёта',
};
const ALL_SOURCES = Object.keys(SOURCE_LABELS);

// Отсчёт бизнес-данных: всё до 1 июня 2026 — тестовый период.
const JUNE1 = '2026-06-01';

const tenge = (n: number) => n.toLocaleString('ru-RU') + ' ₸';
const monthLabel = (m: string) => {
  const names = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  const [y, mm] = m.split('-');
  return `${names[parseInt(mm) - 1]} ${y.slice(2)}`;
};
const dayLabel = (iso: string) =>
  new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{children}</p>;
}

function Kpi({ icon, label, value, hint }: { icon: React.ReactNode; label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-border p-4">
      <div className="flex items-center gap-1.5 text-primary mb-2">{icon}<Eyebrow>{label}</Eyebrow></div>
      <p className="text-3xl font-bold text-foreground tracking-tight tabular-nums">{value}</p>
      {hint && <p className="text-[11px] text-muted-foreground mt-1 leading-tight">{hint}</p>}
    </div>
  );
}

function HBar({ label, value, max, suffix }: { label: string; value: number; max: number; suffix?: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-foreground w-32 truncate shrink-0">{label}</span>
      <div className="flex-1 h-4 bg-secondary/50 rounded overflow-hidden">
        <div className="h-full bg-primary/70 rounded" style={{ width: `${(value / max) * 100}%` }} />
      </div>
      <span className="text-xs font-medium text-foreground w-16 text-right tabular-nums shrink-0">{value.toLocaleString('ru-RU')}{suffix || ''}</span>
    </div>
  );
}

type Preset = 'june' | 'month30' | 'custom';

export default function AdminFinancePage() {
  const today = new Date().toISOString().slice(0, 10);
  const [preset, setPreset] = useState<Preset>('june');
  const [customFrom, setCustomFrom] = useState(JUNE1);
  const [customTo, setCustomTo] = useState(today);
  const [sources, setSources] = useState<string[]>(ALL_SOURCES);

  // Границы периода СТАБИЛЬНЫ между рендерами (useMemo + дневная гранулярность),
  // иначе queryKey меняется каждый рендер и запрос перезапускается бесконечно —
  // именно так «С 1 июня» и «Этот месяц» превращались в вечный скелетон.
  const range = useMemo(() => {
    const endOfToday = new Date(today + 'T23:59:59');
    if (preset === 'month30') {
      const f = new Date(endOfToday); f.setDate(f.getDate() - 30); f.setHours(0, 0, 0, 0);
      return { from: f.toISOString(), to: endOfToday.toISOString() };
    }
    if (preset === 'custom') {
      const t = new Date(customTo + 'T23:59:59'); // включительно
      return { from: new Date(customFrom + 'T00:00:00').toISOString(), to: t.toISOString() };
    }
    return { from: new Date(JUNE1 + 'T00:00:00').toISOString(), to: endOfToday.toISOString() };
  }, [preset, customFrom, customTo, today]);

  const allSelected = sources.length === ALL_SOURCES.length;

  const { data, isLoading, error } = useQuery({
    queryKey: ['finance-dashboard', range.from, range.to, [...sources].sort().join(',')],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_finance_dashboard' as never, {
        p_from: range.from, p_to: range.to,
        p_sources: allSelected ? null : sources,
      } as never);
      if (error) throw error;
      return data as unknown as Finance;
    },
  });

  const toggleSource = (s: string) =>
    setSources(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]);

  const accountingSince = data?.revenue?.accounting_since
    ? new Date(data.revenue.accounting_since).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })
    : null;

  const maxMonthly = Math.max(1, ...(data?.monthly_activations || []).map(m => m.total));
  const maxRevenue = Math.max(1, ...(data?.revenue?.monthly || []).map(m => m.sum));
  const maxTier = data?.by_tier?.[0]?.c || 1;
  const maxSource = data?.by_source?.[0]?.c || 1;

  const PRESETS: { key: Preset; label: string }[] = [
    { key: 'june', label: 'С 1 июня' },
    { key: 'month30', label: 'Месяц' },
    { key: 'custom', label: 'Произвольный' },
  ];

  return (
    <AdminLayout title="Финансы">
      <div className="space-y-5 max-w-4xl">
        {/* Панель фильтров */}
        <Card className="rounded-2xl">
          <CardContent className="pt-4 pb-4 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <CalendarDays className="w-4 h-4 text-muted-foreground shrink-0" />
              {PRESETS.map(p => (
                <Button key={p.key} size="sm" variant={preset === p.key ? 'default' : 'outline'} onClick={() => setPreset(p.key)}>{p.label}</Button>
              ))}
              {preset === 'custom' && (
                <div className="flex items-center gap-2">
                  <Input type="date" value={customFrom} min={JUNE1} onChange={e => setCustomFrom(e.target.value)} className="w-36 h-8 text-sm" />
                  <span className="text-sm text-muted-foreground">—</span>
                  <Input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} className="w-36 h-8 text-sm" />
                </div>
              )}
              <span className="text-xs text-muted-foreground ml-auto tabular-nums">{dayLabel(range.from)} — {dayLabel(range.to)}</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-muted-foreground">Источник:</span>
              <Button size="sm" variant={allSelected ? 'default' : 'outline'} onClick={() => setSources(ALL_SOURCES)}>Все</Button>
              {ALL_SOURCES.map(s => (
                <Button key={s} size="sm" variant={!allSelected && sources.includes(s) ? 'default' : 'outline'}
                  onClick={() => allSelected ? setSources([s]) : toggleSource(s)}>
                  {SOURCE_LABELS[s]}
                </Button>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground flex items-center gap-1">
              <Info className="w-3 h-3 shrink-0" />
              Данные до 1 июня 2026 — тестовый период. «До учёта» — активации до внедрения меток источника.
            </p>
          </CardContent>
        </Card>

        {isLoading ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}
            </div>
            <Skeleton className="h-56 w-full rounded-2xl" />
          </div>
        ) : error ? (
          <Card className="rounded-2xl"><CardContent className="pt-6"><p className="text-sm text-destructive">Не удалось загрузить: {error instanceof Error ? error.message : 'ошибка'}</p></CardContent></Card>
        ) : !data ? null : (
          <>
            {/* KPI */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Kpi icon={<Users size={15} />} label="Активные сейчас" value={String(data.active_now)} hint="действующих подписок" />
              <Kpi icon={<CreditCard size={15} />} label="Активаций" value={String(data.activations_total)} hint={`${data.unique_buyers} уникальных пользователей`} />
              <Kpi icon={<UserPlus size={15} />} label="Новых" value={String(data.new_users)} hint="первая подписка в жизни" />
              <Kpi icon={<RefreshCw size={15} />} label="Продления"
                value={data.renewal.rate_pct === null ? '—' : `${data.renewal.rate_pct}%`}
                hint={`${data.renewal.renewed} из ${data.renewal.expired} истёкших купили снова`} />
            </div>

            {/* Выручка */}
            <div className="rounded-2xl p-5 text-white relative overflow-hidden"
              style={{ background: 'linear-gradient(140deg, hsl(160 30% 14%), hsl(82 45% 26%))' }}>
              <div className="absolute -right-6 -top-6 opacity-[0.08]"><Banknote size={140} /></div>
              <Eyebrow><span className="text-white/70">Выручка · реальные платежи</span></Eyebrow>
              <div className="flex items-end gap-2.5 mt-2">
                <span className="text-4xl font-black leading-none tracking-tight tabular-nums">{data.revenue.total.toLocaleString('ru-RU')}</span>
                <span className="text-xl font-medium text-white/70 mb-0.5">₸</span>
              </div>
              <div className="flex flex-wrap gap-x-5 gap-y-1 mt-3 text-[12px] text-white/85">
                <span>{data.revenue.count} платежей</span>
                <span>средний чек {data.revenue.count > 0 ? tenge(Math.round(data.revenue.total / data.revenue.count)) : '—'}</span>
                <span className="inline-flex items-center gap-1"><Gift size={12} />спецоффер {tenge(data.revenue.special_offer.sum)} ({data.revenue.special_offer.n})</span>
              </div>
              {data.revenue.by_method.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-3">
                  {data.revenue.by_method.map((m, i) => (
                    <span key={i} className="text-[11px] bg-white/12 rounded-lg px-2 py-1">{m.method}: {tenge(m.sum)} ({m.n})</span>
                  ))}
                </div>
              )}
              {accountingSince && (
                <p className="text-[11px] text-white/60 mt-3">Учёт платежей ведётся с {accountingSince} — более ранние продажи проходили вне БД и здесь честно не показываются.</p>
              )}
            </div>

            {/* Выручка по месяцам — только если есть что показать */}
            {data.revenue.monthly.some(m => m.sum > 0) && (
              <Card className="rounded-2xl">
                <CardContent className="pt-5">
                  <div className="flex items-center gap-1.5 mb-3"><TrendingUp size={15} className="text-primary" /><Eyebrow>Выручка по месяцам</Eyebrow></div>
                  <div className="flex items-end gap-2 h-28">
                    {data.revenue.monthly.map((m, i) => (
                      <div key={i} className="flex-1 flex flex-col items-center justify-end gap-1 min-w-0">
                        <span className="text-[10px] font-semibold text-foreground tabular-nums">{m.sum.toLocaleString('ru-RU')}</span>
                        <div className="w-full rounded-t-md bg-primary/75" style={{ height: `${(m.sum / maxRevenue) * 100}%`, minHeight: m.sum > 0 ? '3px' : '0' }} />
                        <span className="text-[9px] text-muted-foreground capitalize">{monthLabel(m.m)}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Активации по месяцам */}
            <Card className="rounded-2xl">
              <CardContent className="pt-5">
                <div className="flex items-center justify-between mb-3">
                  <Eyebrow>Активации по месяцам</Eyebrow>
                  <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                    <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-primary inline-block" />новые</span>
                    <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-primary/35 inline-block" />повторные</span>
                  </div>
                </div>
                <div className="flex items-end gap-2 h-36">
                  {data.monthly_activations.map((m, i) => (
                    <div key={i} className="flex-1 flex flex-col items-center justify-end gap-1 min-w-0">
                      <span className="text-[11px] font-semibold text-foreground tabular-nums">{m.total}</span>
                      <div className="w-full flex flex-col justify-end rounded-t-md overflow-hidden" style={{ height: `${(m.total / maxMonthly) * 100}%`, minHeight: m.total > 0 ? '4px' : '0' }}>
                        <div className="w-full bg-primary" style={{ height: `${m.total > 0 ? (m.new / m.total) * 100 : 0}%` }} title={`новые: ${m.new}`} />
                        <div className="w-full bg-primary/35 flex-1" title={`повторные: ${m.total - m.new}`} />
                      </div>
                      <span className="text-[9px] text-muted-foreground capitalize">{monthLabel(m.m)}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <div className="grid md:grid-cols-2 gap-4">
              <Card className="rounded-2xl">
                <CardContent className="pt-5 space-y-2">
                  <Eyebrow>По тарифам</Eyebrow>
                  {data.by_tier.length === 0 && <p className="text-sm text-muted-foreground">Нет данных за период.</p>}
                  {data.by_tier.map((t, i) => <HBar key={i} label={t.name} value={t.c} max={maxTier} />)}
                </CardContent>
              </Card>
              <Card className="rounded-2xl">
                <CardContent className="pt-5 space-y-2">
                  <Eyebrow>По источникам</Eyebrow>
                  {data.by_source.map((s, i) => <HBar key={i} label={SOURCE_LABELS[s.source] || s.source} value={s.c} max={maxSource} />)}
                </CardContent>
              </Card>
            </div>

            <p className="text-[10px] text-muted-foreground leading-relaxed">
              Все цифры считаются из реальных записей БД. Выручка — только фактические платежи;
              выдачи админом и B2B в выручку не входят. «MRR» не показываем сознательно:
              автопродления пока нет, подписки разовые.
            </p>
          </>
        )}
      </div>
    </AdminLayout>
  );
}
