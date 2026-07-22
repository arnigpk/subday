import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import {
  Building2, Users, Search, Loader2, Trash2, LogOut, User, Copy,
  TrendingUp, Sparkles, BarChart3, LayoutGrid, UserPlus, Award,
} from 'lucide-react';

interface Allocation { id: string; tier: string; seats_total: number; seats_used: number; seats_free: number; expires_at: string | null; }
interface Seat { seat_id: string; tier: string; name: string | null; assigned_at: string; redemptions: number; redemptions_30d: number; last_visit: string | null; }
interface Report { visits_30d: number; adoption_pct: number; monthly: { label: string; c: number }[]; }
interface Overview {
  ok: boolean; error?: string;
  account: { id: string; name: string };
  allocations: Allocation[];
  seats: Seat[];
  stats: { active_seats: number; employees_used: number; total_redemptions: number };
  report: Report;
}

type Tab = 'overview' | 'team' | 'reports';

const fmtDate = (s: string | null) =>
  s ? new Date(s).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }) : 'ещё не заходил';

const initials = (name: string | null) => {
  if (!name) return '—';
  const p = name.trim().split(/\s+/);
  return (p[0]?.[0] || '').concat(p[1]?.[0] || '').toUpperCase() || '—';
};

// Микро-заголовок в премиальном стиле.
function Eyebrow({ children }: { children: React.ReactNode }) {
  return <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{children}</p>;
}

export default function B2BDashboardPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('overview');
  const [search, setSearch] = useState('');
  const [found, setFound] = useState<{ user_id: string; name: string | null; phone_masked: string | null } | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [allocId, setAllocId] = useState('');
  const [isAssigning, setIsAssigning] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['b2b-overview'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('b2b_get_overview');
      if (error) throw error;
      return data as unknown as Overview;
    },
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ['b2b-overview'] });

  const handleSearch = async () => {
    if (!search.trim()) return;
    setIsSearching(true);
    setFound(null);
    try {
      const { data, error } = await supabase.rpc('b2b_find_employee', { p_query: search.trim() });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : null;
      if (!row) { toast.error('Сотрудник не найден. Он должен быть зарегистрирован в subday'); return; }
      setFound(row);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Ошибка поиска');
    } finally { setIsSearching(false); }
  };

  const handleAssign = async () => {
    if (!found || !allocId) { toast.error('Выберите тариф'); return; }
    setIsAssigning(true);
    try {
      const { data, error } = await supabase.rpc('b2b_assign_seat', { p_allocation_id: allocId, p_employee_user_id: found.user_id });
      if (error) throw error;
      const r = data as { ok?: boolean };
      if (r?.ok) { toast.success('Место выдано, сотрудник получит уведомление'); setFound(null); setSearch(''); setAllocId(''); refresh(); }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Не удалось выдать место');
    } finally { setIsAssigning(false); }
  };

  const handleRevoke = async (seatId: string, name: string | null) => {
    if (!confirm(`Отозвать место у «${name || 'сотрудника'}»? Подписка станет неактивной.`)) return;
    try {
      const { error } = await supabase.rpc('b2b_revoke_seat', { p_seat_id: seatId });
      if (error) throw error;
      toast.success('Место отозвано');
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Не удалось отозвать');
    }
  };

  const logout = async () => { await supabase.auth.signOut(); window.location.href = '/'; };

  if (isLoading) {
    return <div className="p-4 space-y-4"><Skeleton className="h-40 w-full rounded-3xl" /><Skeleton className="h-40 w-full rounded-3xl" /></div>;
  }

  if (!data?.ok) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 p-6 text-center">
        <Building2 className="w-10 h-10 text-muted-foreground" />
        <p className="text-foreground font-semibold">Бизнес-аккаунт не найден</p>
        <p className="text-sm text-muted-foreground max-w-xs">Обратитесь в subday, чтобы подключить корпоративные подписки.</p>
        <Button variant="outline" onClick={logout}>Выйти</Button>
      </div>
    );
  }

  const totalSeats = data.allocations.reduce((s, a) => s + a.seats_total, 0);
  const usedSeats = data.allocations.reduce((s, a) => s + a.seats_used, 0);
  const freeSeats = Math.max(0, totalSeats - usedSeats);
  const occupancy = totalSeats > 0 ? Math.round((usedSeats / totalSeats) * 100) : 0;
  const monthlyMax = Math.max(1, ...(data.report?.monthly || []).map(m => m.c));
  const topSeats = [...data.seats].sort((a, b) => b.redemptions_30d - a.redemptions_30d).slice(0, 5);

  const TABS: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: 'overview', label: 'Обзор', icon: <LayoutGrid size={15} /> },
    { key: 'team', label: 'Команда', icon: <Users size={15} /> },
    { key: 'reports', label: 'Отчёты', icon: <BarChart3 size={15} /> },
  ];

  return (
    <div className="min-safe-screen bg-background">
      {/* Премиальная шапка */}
      <header className="sticky top-0 z-30 bg-card/80 backdrop-blur-xl border-b border-border">
        <div className="safe-area-top" />
        <div className="px-5 py-3.5 flex items-center justify-between max-w-2xl mx-auto">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-foreground text-background flex items-center justify-center shrink-0">
              <Building2 size={18} />
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-foreground leading-tight tracking-tight truncate">{data.account.name}</p>
              <Eyebrow>subday · корпоративный кабинет</Eyebrow>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={logout} aria-label="Выйти"><LogOut size={18} /></Button>
        </div>
        {/* Вкладки */}
        <div className="px-5 max-w-2xl mx-auto">
          <div className="flex gap-1 -mb-px">
            {TABS.map(t => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                  tab === t.key ? 'border-foreground text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                {t.icon}{t.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="p-4 sm:p-5 space-y-4 max-w-2xl mx-auto">
        {/* ─────────────── ОБЗОР ─────────────── */}
        {tab === 'overview' && (
          <>
            {/* Геройский блок */}
            <div className="rounded-3xl p-6 text-white relative overflow-hidden"
              style={{ background: 'linear-gradient(140deg, hsl(160 30% 14%), hsl(82 45% 26%))' }}>
              <div className="absolute -right-8 -top-8 opacity-[0.08]"><Sparkles size={160} /></div>
              <Eyebrow><span className="text-white/70">Занятость пула</span></Eyebrow>
              <div className="flex items-end gap-2.5 mt-2">
                <span className="text-5xl font-black leading-none tracking-tight">{usedSeats}</span>
                <span className="text-xl font-medium text-white/70 mb-1">/ {totalSeats}</span>
              </div>
              <div className="h-1.5 bg-white/15 rounded-full overflow-hidden mt-4">
                <div className="h-full bg-white rounded-full transition-all" style={{ width: `${occupancy}%` }} />
              </div>
              <div className="flex items-center justify-between mt-2.5 text-[12px] text-white/80">
                <span>{occupancy}% используется</span>
                <span>Свободно: {freeSeats}</span>
              </div>
            </div>

            {/* Деловые KPI */}
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl border border-border p-4">
                <div className="flex items-center gap-1.5 text-primary mb-2"><TrendingUp size={15} /><Eyebrow>Вовлечённость</Eyebrow></div>
                <p className="text-3xl font-bold text-foreground tracking-tight">{data.report?.adoption_pct ?? 0}%</p>
                <p className="text-[11px] text-muted-foreground mt-1">сотрудников пользуются за 30 дней</p>
              </div>
              <div className="rounded-2xl border border-border p-4">
                <div className="flex items-center gap-1.5 text-primary mb-2"><BarChart3 size={15} /><Eyebrow>Визиты · 30 дней</Eyebrow></div>
                <p className="text-3xl font-bold text-foreground tracking-tight">{data.report?.visits_30d ?? 0}</p>
                <p className="text-[11px] text-muted-foreground mt-1">списаний командой за месяц</p>
              </div>
            </div>

            {/* Пулы */}
            <Card className="rounded-2xl">
              <CardContent className="pt-5 space-y-4">
                <Eyebrow>Пулы подписок</Eyebrow>
                {data.allocations.length === 0 && <p className="text-sm text-muted-foreground">Пулы ещё не выданы. Обратитесь в subday.</p>}
                {data.allocations.map(a => (
                  <div key={a.id} className="space-y-1.5">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium text-foreground">{a.tier}</span>
                      <span className="text-muted-foreground tabular-nums">{a.seats_used} / {a.seats_total}</span>
                    </div>
                    <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                      <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${a.seats_total > 0 ? (a.seats_used / a.seats_total) * 100 : 0}%` }} />
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                      <span>Свободно: <span className="font-semibold text-foreground">{a.seats_free}</span></span>
                      {a.expires_at && <span>до {fmtDate(a.expires_at)}</span>}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </>
        )}

        {/* ─────────────── КОМАНДА ─────────────── */}
        {tab === 'team' && (
          <>
            {/* Выдать место */}
            <Card className="rounded-2xl">
              <CardContent className="pt-5 space-y-3">
                <div className="flex items-center gap-1.5 text-foreground"><UserPlus size={16} className="text-primary" /><span className="font-semibold text-sm">Выдать место сотруднику</span></div>
                <div className="flex gap-2">
                  <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="ID (6 цифр) или телефон" onKeyDown={e => e.key === 'Enter' && handleSearch()} />
                  <Button onClick={handleSearch} disabled={isSearching}>{isSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}</Button>
                </div>
                {found && (
                  <div className="rounded-xl bg-secondary p-3 space-y-2 border border-primary/20">
                    <div className="flex items-center gap-2">
                      <div className="w-9 h-9 rounded-full bg-primary/15 flex items-center justify-center text-xs font-bold text-primary shrink-0">{initials(found.name)}</div>
                      <div className="min-w-0">
                        <p className="font-medium text-foreground truncate">{found.name || 'Без имени'}</p>
                        <p className="text-xs text-muted-foreground">{found.phone_masked}</p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Select value={allocId} onValueChange={setAllocId}>
                        <SelectTrigger className="flex-1"><SelectValue placeholder="Тариф из пула" /></SelectTrigger>
                        <SelectContent>
                          {data.allocations.filter(a => a.seats_free > 0).map(a => (
                            <SelectItem key={a.id} value={a.id}>{a.tier} (свободно {a.seats_free})</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button onClick={handleAssign} disabled={isAssigning}>{isAssigning ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Выдать'}</Button>
                    </div>
                  </div>
                )}

                {/* Подсказка: где взять ID */}
                <div className="bg-muted/50 rounded-xl p-4">
                  <p className="text-sm font-medium text-foreground mb-3">Где сотруднику взять свой ID?</p>
                  <div className="bg-card rounded-xl p-3 border border-border shadow-sm">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0"><User size={20} className="text-primary" /></div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-foreground truncate">Айдана</p>
                        <div className="flex items-center gap-1 mt-0.5">
                          <span className="text-xs text-muted-foreground font-mono px-1.5 py-0.5 rounded bg-accent/15 border border-accent/30 animate-pulse">ID: 123456</span>
                          <Copy size={10} className="text-accent" />
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 mt-2 ml-[52px]">
                      <span className="text-accent text-xs">↑</span>
                      <span className="text-[11px] text-muted-foreground">Профиль в приложении subday — под именем, можно скопировать</span>
                    </div>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-3">Подписка активируется сразу, сотруднику придёт уведомление.</p>
                </div>
              </CardContent>
            </Card>

            {/* Список сотрудников */}
            <Card className="rounded-2xl">
              <CardContent className="pt-5 space-y-2">
                <div className="flex items-center justify-between">
                  <Eyebrow>Сотрудники</Eyebrow>
                  <span className="text-xs text-muted-foreground">{data.seats.length}</span>
                </div>
                {data.seats.length === 0 && (
                  <div className="text-center py-6">
                    <Users className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">Мест ещё не выдано.</p>
                  </div>
                )}
                {data.seats.map(s => (
                  <div key={s.seat_id} className="flex items-center gap-3 rounded-xl border border-border px-3 py-2.5">
                    <div className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center text-xs font-bold text-foreground shrink-0">{initials(s.name)}</div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-foreground truncate">{s.name || 'Без имени'}</p>
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-medium shrink-0">{s.tier}</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {s.redemptions_30d} за 30 дней · последний визит {fmtDate(s.last_visit)}
                      </p>
                    </div>
                    <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive shrink-0" onClick={() => handleRevoke(s.seat_id, s.name)} aria-label="Отозвать место">
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>
          </>
        )}

        {/* ─────────────── ОТЧЁТЫ ─────────────── */}
        {tab === 'reports' && (
          <>
            {/* Помесячная активность команды */}
            <Card className="rounded-2xl">
              <CardContent className="pt-5 space-y-4">
                <Eyebrow>Активность команды · 6 месяцев</Eyebrow>
                {(data.report?.monthly || []).every(m => m.c === 0) ? (
                  <p className="text-sm text-muted-foreground">Пока нет визитов за последние месяцы.</p>
                ) : (
                  <div className="flex items-end gap-2 h-40">
                    {(data.report?.monthly || []).map((m, i) => (
                      <div key={i} className="flex-1 flex flex-col items-center justify-end gap-1.5 min-w-0">
                        <span className="text-[11px] font-semibold text-foreground tabular-nums">{m.c || ''}</span>
                        <div className="w-full rounded-t-md bg-primary/80" style={{ height: `${(m.c / monthlyMax) * 100}%`, minHeight: m.c > 0 ? '4px' : '0' }} />
                        <span className="text-[10px] text-muted-foreground capitalize truncate w-full text-center">{m.label}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Сводка */}
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl border border-border p-4">
                <Eyebrow>Вовлечённость</Eyebrow>
                <p className="text-2xl font-bold text-foreground mt-1.5">{data.report?.adoption_pct ?? 0}%</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">активны за 30 дней</p>
              </div>
              <div className="rounded-2xl border border-border p-4">
                <Eyebrow>Всего за всё время</Eyebrow>
                <p className="text-2xl font-bold text-foreground mt-1.5">{data.stats.total_redemptions}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">списаний командой</p>
              </div>
            </div>

            {/* Самые активные сотрудники */}
            <Card className="rounded-2xl">
              <CardContent className="pt-5 space-y-3">
                <div className="flex items-center gap-1.5"><Award size={15} className="text-primary" /><Eyebrow>Самые активные · 30 дней</Eyebrow></div>
                {topSeats.filter(s => s.redemptions_30d > 0).length === 0 ? (
                  <p className="text-sm text-muted-foreground">Пока нет активности за 30 дней.</p>
                ) : (
                  topSeats.filter(s => s.redemptions_30d > 0).map((s, i) => {
                    const max = topSeats[0]?.redemptions_30d || 1;
                    return (
                      <div key={s.seat_id} className="flex items-center gap-3">
                        <span className="text-xs font-bold text-muted-foreground w-4 text-center">{i + 1}</span>
                        <div className="w-7 h-7 rounded-full bg-secondary flex items-center justify-center text-[10px] font-bold text-foreground shrink-0">{initials(s.name)}</div>
                        <span className="text-sm text-foreground truncate flex-1 min-w-0">{s.name || 'Без имени'}</span>
                        <div className="w-24 h-2 bg-secondary rounded-full overflow-hidden shrink-0">
                          <div className="h-full bg-primary rounded-full" style={{ width: `${(s.redemptions_30d / max) * 100}%` }} />
                        </div>
                        <span className="text-xs font-semibold text-foreground w-6 text-right tabular-nums">{s.redemptions_30d}</span>
                      </div>
                    );
                  })
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
      <div className="safe-area-bottom" />
    </div>
  );
}
