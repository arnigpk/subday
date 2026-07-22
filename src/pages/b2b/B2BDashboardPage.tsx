import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { Building2, Users, UserCheck, Coffee, Search, Loader2, Trash2, LogOut } from 'lucide-react';

interface Allocation { id: string; tier: string; seats_total: number; seats_used: number; seats_free: number; expires_at: string | null; }
interface Seat { seat_id: string; tier: string; name: string | null; assigned_at: string; redemptions: number; last_visit: string | null; }
interface Overview {
  ok: boolean; error?: string;
  account: { id: string; name: string };
  allocations: Allocation[];
  seats: Seat[];
  stats: { active_seats: number; employees_used: number; total_redemptions: number };
}

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
      if (r?.ok) { toast.success('Место выдано, подписка активна'); setFound(null); setSearch(''); refresh(); }
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
    return <div className="p-4"><Skeleton className="h-64 w-full" /></div>;
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
        {/* Пулы мест */}
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Пулы подписок</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {data.allocations.length === 0 && <p className="text-sm text-muted-foreground">Пулы ещё не выданы.</p>}
            {data.allocations.map(a => (
              <div key={a.id} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-foreground">{a.tier}</span>
                  <span className="text-muted-foreground">{a.seats_used} / {a.seats_total} занято</span>
                </div>
                <div className="h-2.5 bg-secondary/60 rounded-full overflow-hidden">
                  <div className="h-full bg-primary rounded-full" style={{ width: `${(a.seats_used / a.seats_total) * 100}%` }} />
                </div>
                <p className="text-[11px] text-muted-foreground">Свободно: {a.seats_free}</p>
              </div>
            ))}
          </CardContent>
        </Card>

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

        {/* Выдать место */}
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Выдать место сотруднику</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <div className="flex gap-2">
              <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="ID (6 цифр) или телефон" onKeyDown={e => e.key === 'Enter' && handleSearch()} />
              <Button onClick={handleSearch} disabled={isSearching}>{isSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}</Button>
            </div>
            {found && (
              <div className="rounded-lg bg-secondary p-3 space-y-2">
                <div>
                  <p className="font-medium text-foreground">{found.name || 'Без имени'}</p>
                  <p className="text-xs text-muted-foreground">{found.phone_masked}</p>
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
                  <Button onClick={handleAssign} disabled={isAssigning}>{isAssigning ? '...' : 'Выдать'}</Button>
                </div>
              </div>
            )}
            <p className="text-[11px] text-muted-foreground">Сотрудник должен быть зарегистрирован в приложении subday. Подписка активируется сразу.</p>
          </CardContent>
        </Card>

        {/* Сотрудники */}
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Сотрудники ({data.seats.length})</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {data.seats.length === 0 && <p className="text-sm text-muted-foreground">Мест ещё не выдано.</p>}
            {data.seats.map(s => (
              <div key={s.seat_id} className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{s.name || 'Без имени'}</p>
                  <p className="text-[11px] text-muted-foreground">{s.tier} · {s.redemptions} списаний</p>
                </div>
                <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive shrink-0" onClick={() => handleRevoke(s.seat_id, s.name)}>
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
