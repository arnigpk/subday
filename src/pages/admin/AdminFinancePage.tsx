import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { Users, UserPlus, RefreshCw, Banknote, CreditCard, Landmark, CalendarDays, Info } from 'lucide-react';

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

function Metric({ icon, label, value, hint }: { icon: React.ReactNode; label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl bg-secondary/50 p-3">
      <div className="flex items-center gap-1.5 text-muted-foreground mb-1">{icon}<span className="text-[11px] leading-tight">{label}</span></div>
      <p className="font-bold text-lg text-foreground">{value}</p>
      {hint && <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">{hint}</p>}
    </div>
  );
}

export default function AdminFinancePage() {
  const today = new Date().toISOString().slice(0, 10);
  const [preset, setPreset] = useState<'june' | 'thisMonth' | 'lastMonth' | 'custom'>('june');
  const [customFrom, setCustomFrom] = useState(JUNE1);
  const [customTo, setCustomTo] = useState(today);
  const [sources, setSources] = useState<string[]>(ALL_SOURCES);

  const range = (() => {
    const now = new Date();
    if (preset === 'thisMonth') return { from: new Date(now.getFullYear(), now.getMonth(), 1).toISOString(), to: now.toISOString() };
    if (preset === 'lastMonth') {
      const f = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const t = new Date(now.getFullYear(), now.getMonth(), 1);
      return { from: f.toISOString(), to: t.toISOString() };
    }
    if (preset === 'custom') {
      const t = new Date(customTo); t.setDate(t.getDate() + 1); // включительно
      return { from: new Date(customFrom).toISOString(), to: t.toISOString() };
    }
    return { from: new Date(JUNE1).toISOString(), to: now.toISOString() };
  })();

  const allSelected = sources.length === ALL_SOURCES.length;

  const { data, isLoading, error } = useQuery({
    queryKey: ['finance-dashboard', range.from, range.to, sources],
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

  return (
    <AdminLayout title="Финансы">
      <div className="space-y-4 max-w-4xl">
        {/* Период */}
        <div className="flex flex-wrap items-center gap-2">
          <CalendarDays className="w-4 h-4 text-muted-foreground" />
          {([['june', 'С 1 июня'], ['thisMonth', 'Этот месяц'], ['lastMonth', 'Прошлый месяц'], ['custom', 'Произвольный']] as const).map(([k, label]) => (
            <Button key={k} size="sm" variant={preset === k ? 'default' : 'outline'} onClick={() => setPreset(k)}>{label}</Button>
          ))}
          {preset === 'custom' && (
            <div className="flex items-center gap-2">
              <Input type="date" value={customFrom} min={JUNE1} onChange={e => setCustomFrom(e.target.value)} className="w-36 h-8 text-sm" />
              <span className="text-sm text-muted-foreground">—</span>
              <Input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} className="w-36 h-8 text-sm" />
            </div>
          )}
        </div>

        {/* Фильтр источников */}
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

        {isLoading ? (
          <Skeleton className="h-72 w-full" />
        ) : error ? (
          <Card><CardContent className="pt-6"><p className="text-sm text-destructive">Не удалось загрузить: {error instanceof Error ? error.message : 'ошибка'}</p></CardContent></Card>
        ) : !data ? null : (
          <>
            {/* Ключевые показатели */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <Metric icon={<Users size={13} />} label="Активные подписки сейчас" value={String(data.active_now)} />
              <Metric icon={<CreditCard size={13} />} label="Активаций за период" value={String(data.activations_total)} hint={`${data.unique_buyers} уникальных пользователей`} />
              <Metric icon={<UserPlus size={13} />} label="Новых пользователей" value={String(data.new_users)} hint="Первая подписка в жизни" />
              <Metric icon={<RefreshCw size={13} />} label="Продления"
                value={data.renewal.rate_pct === null ? '—' : `${data.renewal.rate_pct}%`}
                hint={`${data.renewal.renewed} из ${data.renewal.expired} истёкших купили снова (14 дн.)`} />
            </div>

            {/* Выручка — только реальные платежи */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2"><Banknote size={16} className="text-primary" />Выручка (реальные платежи)</CardTitle>
                {accountingSince && (
                  <p className="text-xs text-muted-foreground">Учёт платежей в системе ведётся с {accountingSince} — более ранние продажи проходили вне БД и здесь честно не показываются.</p>
                )}
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  <Metric icon={<Banknote size={13} />} label="Выручка за период" value={tenge(data.revenue.total)} hint={`${data.revenue.count} платежей`} />
                  <Metric icon={<Landmark size={13} />} label="Спецпредложения" value={tenge(data.revenue.special_offer.sum)} hint={`${data.revenue.special_offer.n} платежей`} />
                  <Metric icon={<CreditCard size={13} />} label="Средний чек"
                    value={data.revenue.count > 0 ? tenge(Math.round(data.revenue.total / data.revenue.count)) : '—'} />
                </div>
                {data.revenue.monthly.length > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-2">По месяцам</p>
                    <div className="flex items-end gap-2 h-28">
                      {data.revenue.monthly.map((m, i) => (
                        <div key={i} className="flex-1 flex flex-col items-center justify-end gap-1 min-w-0">
                          <span className="text-[10px] font-semibold text-foreground">{m.sum.toLocaleString('ru-RU')}</span>
                          <div className="w-full rounded-t bg-primary/70" style={{ height: `${(m.sum / maxRevenue) * 100}%`, minHeight: m.sum > 0 ? '3px' : '0' }} />
                          <span className="text-[9px] text-muted-foreground">{monthLabel(m.m)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {data.revenue.by_method.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {data.revenue.by_method.map((m, i) => (
                      <span key={i} className="text-xs bg-secondary rounded-lg px-2 py-1">{m.method}: {tenge(m.sum)} ({m.n})</span>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Активации по месяцам: новые vs повторные */}
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">Активации по месяцам</CardTitle></CardHeader>
              <CardContent>
                <div className="flex items-end gap-2 h-36">
                  {data.monthly_activations.map((m, i) => (
                    <div key={i} className="flex-1 flex flex-col items-center justify-end gap-1 min-w-0">
                      <span className="text-[11px] font-semibold text-foreground">{m.total}</span>
                      <div className="w-full flex flex-col justify-end rounded-t overflow-hidden" style={{ height: `${(m.total / maxMonthly) * 100}%`, minHeight: m.total > 0 ? '4px' : '0' }}>
                        <div className="w-full bg-primary" style={{ height: `${m.total > 0 ? (m.new / m.total) * 100 : 0}%` }} title={`новые: ${m.new}`} />
                        <div className="w-full bg-primary/35 flex-1" title={`повторные: ${m.total - m.new}`} />
                      </div>
                      <span className="text-[9px] text-muted-foreground">{monthLabel(m.m)}</span>
                    </div>
                  ))}
                </div>
                <div className="flex items-center gap-4 mt-2 text-[11px] text-muted-foreground">
                  <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-primary inline-block" />Новые пользователи</span>
                  <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-primary/35 inline-block" />Повторные</span>
                </div>
              </CardContent>
            </Card>

            <div className="grid md:grid-cols-2 gap-4">
              {/* По тарифам */}
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-base">По тарифам</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                  {data.by_tier.length === 0 && <p className="text-sm text-muted-foreground">Нет данных за период.</p>}
                  {data.by_tier.map((t, i) => {
                    const max = data.by_tier[0]?.c || 1;
                    return (
                      <div key={i} className="flex items-center gap-2">
                        <span className="text-xs text-foreground w-28 truncate shrink-0">{t.name}</span>
                        <div className="flex-1 h-4 bg-secondary/50 rounded overflow-hidden">
                          <div className="h-full bg-primary/70 rounded" style={{ width: `${(t.c / max) * 100}%` }} />
                        </div>
                        <span className="text-xs font-medium text-foreground w-8 text-right">{t.c}</span>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>

              {/* По источникам */}
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-base">По источникам</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                  {data.by_source.map((s, i) => {
                    const max = data.by_source[0]?.c || 1;
                    return (
                      <div key={i} className="flex items-center gap-2">
                        <span className="text-xs text-foreground w-28 truncate shrink-0">{SOURCE_LABELS[s.source] || s.source}</span>
                        <div className="flex-1 h-4 bg-secondary/50 rounded overflow-hidden">
                          <div className="h-full bg-primary/70 rounded" style={{ width: `${(s.c / max) * 100}%` }} />
                        </div>
                        <span className="text-xs font-medium text-foreground w-8 text-right">{s.c}</span>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            </div>

            <p className="text-[10px] text-muted-foreground leading-relaxed">
              Все цифры считаются из реальных записей БД. Выручка — только фактические платежи
              (Kaspi/FreedomPay/карта); выдачи админом и B2B в выручку не входят. «MRR» не показываем
              сознательно: автопродления пока нет, подписки разовые.
            </p>
          </>
        )}
      </div>
    </AdminLayout>
  );
}
