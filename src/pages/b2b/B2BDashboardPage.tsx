import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import {
  Building2, Users, UserCheck, Coffee, Search, Loader2, Trash2, LogOut,
  User, Copy, LayoutGrid, CalendarDays, Sparkles,
} from 'lucide-react';

interface Allocation { id: string; tier: string; seats_total: number; seats_used: number; seats_free: number; expires_at: string | null; }
interface Seat { seat_id: string; tier: string; name: string | null; assigned_at: string; redemptions: number; last_visit: string | null; }
interface Overview {
  ok: boolean; error?: string;
  account: { id: string; name: string };
  allocations: Allocation[];
  seats: Seat[];
  stats: { active_seats: number; employees_used: number; total_redemptions: number };
}

const fmtDate = (s: string | null) =>
  s ? new Date(s).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }) : '—';

// Инициалы для аватара сотрудника.
const initials = (name: string | null) => {
  if (!name) return '👤';
  const parts = name.trim().split(/\s+/);
  return (parts[0]?.[0] || '').concat(parts[1]?.[0] || '').toUpperCase() || '👤';
};

export default function B2BDashboardPage() {
  const qc = useQueryClient();
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
    return <div className="p-4 space-y-4"><Skeleton className="h-32 w-full rounded-2xl" /><Skeleton className="h-40 w-full rounded-2xl" /></div>;
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

  // Сводка по всем пулам — для «геройского» блока сверху.
  const totalSeats = data.allocations.reduce((s, a) => s + a.seats_total, 0);
  const usedSeats = data.allocations.reduce((s, a) => s + a.seats_used, 0);
  const freeSeats = Math.max(0, totalSeats - usedSeats);
  const occupancy = totalSeats > 0 ? Math.round((usedSeats / totalSeats) * 100) : 0;

  return (
    <div className="min-safe-screen bg-background">
      <header className="bg-card border-b border-border sticky top-0 z-30">
        <div className="safe-area-top" />
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-primary/15 flex items-center justify-center"><Building2 size={18} className="text-primary" /></div>
            <div>
              <p className="font-bold text-foreground leading-tight">{data.account.name}</p>
              <p className="text-[11px] text-muted-foreground">Корпоративные подписки subday</p>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={logout} aria-label="Выйти"><LogOut size={18} /></Button>
        </div>
      </header>

      <div className="p-4 space-y-4 max-w-2xl mx-auto">
        {/* Геройский блок — общая занятость пула */}
        <div
          className="rounded-2xl p-5 text-white relative overflow-hidden"
          style={{ background: 'linear-gradient(135deg, hsl(82 60% 32%), hsl(160 45% 26%))' }}
        >
          <div className="absolute -right-6 -top-6 opacity-10"><Sparkles size={120} /></div>
          <p className="text-[13px] font-medium opacity-90">Занято мест</p>
          <div className="flex items-end gap-2 mt-1">
            <span className="text-4xl font-black leading-none">{usedSeats}</span>
            <span className="text-lg font-semibold opacity-80 mb-0.5">/ {totalSeats}</span>
          </div>
          <div className="h-2 bg-white/20 rounded-full overflow-hidden mt-3">
            <div className="h-full bg-white rounded-full transition-all" style={{ width: `${occupancy}%` }} />
          </div>
          <div className="flex items-center justify-between mt-2 text-[12px] opacity-90">
            <span>{occupancy}% пула используется</span>
            <span>Свободно: {freeSeats}</span>
          </div>
        </div>

        {/* Статистика */}
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-xl bg-secondary/50 p-3 text-center">
            <Users size={16} className="text-primary mx-auto mb-1" />
            <p className="text-lg font-bold text-foreground">{data.stats.active_seats}</p>
            <p className="text-[10px] text-muted-foreground">Активных мест</p>
          </div>
          <div className="rounded-xl bg-secondary/50 p-3 text-center">
            <UserCheck size={16} className="text-primary mx-auto mb-1" />
            <p className="text-lg font-bold text-foreground">{data.stats.employees_used}</p>
            <p className="text-[10px] text-muted-foreground">Реально пользуются</p>
          </div>
          <div className="rounded-xl bg-secondary/50 p-3 text-center">
            <Coffee size={16} className="text-primary mx-auto mb-1" />
            <p className="text-lg font-bold text-foreground">{data.stats.total_redemptions}</p>
            <p className="text-[10px] text-muted-foreground">Всего списаний</p>
          </div>
        </div>

        {/* Пулы мест */}
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><LayoutGrid size={16} className="text-primary" />Пулы подписок</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {data.allocations.length === 0 && <p className="text-sm text-muted-foreground">Пулы ещё не выданы. Обратитесь в subday.</p>}
            {data.allocations.map(a => (
              <div key={a.id} className="space-y-1.5">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-foreground">{a.tier}</span>
                  <span className="text-muted-foreground tabular-nums">{a.seats_used} / {a.seats_total}</span>
                </div>
                <div className="h-2.5 bg-secondary/60 rounded-full overflow-hidden">
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

        {/* Выдать место */}
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><UserCheck size={16} className="text-primary" />Выдать место сотруднику</CardTitle></CardHeader>
          <CardContent className="space-y-3">
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

            {/* Подсказка: откуда взять ID сотрудника */}
            <div className="bg-muted/50 rounded-xl p-4">
              <p className="text-sm font-medium text-foreground mb-3">Где сотруднику взять свой ID?</p>
              <div className="bg-card rounded-xl p-3 border border-border shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <User size={20} className="text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-foreground truncate">Айдана</p>
                    <div className="flex items-center gap-1 mt-0.5">
                      <span className="text-xs text-muted-foreground font-mono px-1.5 py-0.5 rounded bg-accent/15 border border-accent/30 animate-pulse">
                        ID: 123456
                      </span>
                      <Copy size={10} className="text-accent" />
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-2 ml-[52px]">
                  <span className="text-accent text-xs">↑</span>
                  <span className="text-[11px] text-muted-foreground">Профиль в приложении subday — под именем, можно скопировать</span>
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground mt-3">
                Сотрудник должен быть зарегистрирован в subday. Подписка активируется сразу, ему придёт уведомление.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Сотрудники */}
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><Users size={16} className="text-primary" />Сотрудники ({data.seats.length})</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {data.seats.length === 0 && (
              <div className="text-center py-6">
                <Users className="w-8 h-8 text-muted-foreground/50 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">Мест ещё не выдано.</p>
                <p className="text-xs text-muted-foreground/70 mt-0.5">Найдите сотрудника выше и выдайте ему место.</p>
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
                  <div className="flex items-center gap-3 text-[11px] text-muted-foreground mt-0.5">
                    <span className="inline-flex items-center gap-1"><Coffee size={11} />{s.redemptions} списаний</span>
                    <span className="inline-flex items-center gap-1"><CalendarDays size={11} />выдано {fmtDate(s.assigned_at)}</span>
                  </div>
                </div>
                <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive shrink-0" onClick={() => handleRevoke(s.seat_id, s.name)} aria-label="Отозвать место">
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
      <div className="safe-area-bottom" />
    </div>
  );
}
