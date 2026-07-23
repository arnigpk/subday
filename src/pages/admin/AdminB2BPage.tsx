import { useState, useEffect } from 'react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import {
  Building2, Plus, Search, Loader2, Trash2, UserMinus, UserPlus, Users, ChevronDown, ChevronUp, Coffee,
} from 'lucide-react';

interface SubType { id: string; name: string; }
interface AdminAllocation { id: string; tier: string; seats_total: number; seats_used: number; expires_at: string | null; }
interface AdminSeat { seat_id: string; tier: string; name: string | null; public_id: string | null; assigned_at: string; redemptions: number; }
interface AdminConsumedSeat { seat_id: string; tier: string; name: string | null; public_id: string | null; revoked_at: string | null; }
interface AdminAccount {
  id: string; name: string; contact_name: string | null; contact_phone: string | null;
  admin_user_id: string | null; owner_name: string | null; owner_public_id: string | null;
  is_active: boolean; created_at: string; seats_total: number; seats_used: number;
  allocations: AdminAllocation[]; seats: AdminSeat[]; consumed_seats: AdminConsumedSeat[];
}

const fmtDate = (s: string | null) =>
  s ? new Date(s).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

export default function AdminB2BPage() {
  const { toast } = useToast();
  const [accounts, setAccounts] = useState<AdminAccount[]>([]);
  const [subTypes, setSubTypes] = useState<SubType[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  // Создание аккаунта
  const [name, setName] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [adminCode, setAdminCode] = useState('');
  const [foundAdmin, setFoundAdmin] = useState<{ user_id: string; name: string | null; phone_masked: string | null } | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  // Выдача пула
  const [allocTier, setAllocTier] = useState<Record<string, string>>({});
  const [allocSeats, setAllocSeats] = useState<Record<string, string>>({});

  // Выдача места сотруднику (в разрезе аккаунта)
  const [empQuery, setEmpQuery] = useState<Record<string, string>>({});
  const [empFound, setEmpFound] = useState<Record<string, { user_id: string; name: string | null; phone_masked: string | null } | null>>({});
  const [empBusy, setEmpBusy] = useState<Record<string, boolean>>({});
  const [empAlloc, setEmpAlloc] = useState<Record<string, string>>({});

  // Смена/назначение админа бизнеса (владельца кабинета)
  const [ownerCode, setOwnerCode] = useState<Record<string, string>>({});
  const [ownerFound, setOwnerFound] = useState<Record<string, { user_id: string; name: string | null; phone_masked: string | null } | null>>({});
  const [ownerBusy, setOwnerBusy] = useState<Record<string, boolean>>({});

  const load = async () => {
    setLoading(true);
    const [ovRes, stRes] = await Promise.all([
      supabase.rpc('b2b_admin_overview'),
      supabase.from('subscription_types').select('id, name').eq('is_active', true).order('price'),
    ]);
    if (ovRes.error) toast({ title: 'Ошибка загрузки', description: ovRes.error.message, variant: 'destructive' });
    setAccounts((ovRes.data as unknown as AdminAccount[]) || []);
    setSubTypes((stRes.data as SubType[]) || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const searchAdmin = async () => {
    if (!adminCode.trim()) return;
    setIsSearching(true);
    setFoundAdmin(null);
    try {
      const { data, error } = await supabase.rpc('find_user_by_public_id', { _public_id: adminCode.trim() });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : null;
      if (!row) { toast({ title: 'Пользователь не найден', variant: 'destructive' }); return; }
      setFoundAdmin(row);
    } catch (e) {
      toast({ title: 'Ошибка поиска', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    } finally { setIsSearching(false); }
  };

  const createAccount = async () => {
    if (!name.trim() || !foundAdmin) { toast({ title: 'Заполните название и найдите админа бизнеса', variant: 'destructive' }); return; }
    setIsCreating(true);
    try {
      const { error } = await supabase.rpc('b2b_admin_create_account', {
        p_name: name.trim(), p_admin_user_id: foundAdmin.user_id,
        p_contact_name: contactName.trim() || null, p_contact_phone: contactPhone.trim() || null,
      });
      if (error) throw error;
      toast({ title: '✅ Бизнес-аккаунт создан' });
      setName(''); setContactName(''); setContactPhone(''); setAdminCode(''); setFoundAdmin(null);
      load();
    } catch (e) {
      toast({ title: 'Ошибка создания', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    } finally { setIsCreating(false); }
  };

  const addAllocation = async (accountId: string) => {
    const tier = allocTier[accountId];
    const seats = parseInt(allocSeats[accountId] || '');
    if (!tier || !seats || seats < 1) { toast({ title: 'Выберите тариф и число мест', variant: 'destructive' }); return; }
    const { error } = await supabase.from('b2b_allocations').insert({ account_id: accountId, subscription_type_id: tier, seats_total: seats });
    if (error) { toast({ title: 'Ошибка', description: error.message, variant: 'destructive' }); return; }
    toast({ title: `Выдано мест: ${seats}` });
    setAllocSeats(prev => ({ ...prev, [accountId]: '' }));
    load();
  };

  const searchEmp = async (accId: string) => {
    const q = (empQuery[accId] || '').trim();
    if (!q) return;
    setEmpBusy(p => ({ ...p, [accId]: true }));
    setEmpFound(p => ({ ...p, [accId]: null }));
    try {
      const { data, error } = await supabase.rpc('b2b_find_employee', { p_query: q });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : null;
      if (!row) { toast({ title: 'Сотрудник не найден', description: 'Должен быть зарегистрирован в subday', variant: 'destructive' }); return; }
      setEmpFound(p => ({ ...p, [accId]: row }));
    } catch (e) {
      toast({ title: 'Ошибка поиска', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    } finally { setEmpBusy(p => ({ ...p, [accId]: false })); }
  };

  const assignEmp = async (accId: string) => {
    const found = empFound[accId];
    const alloc = empAlloc[accId];
    if (!found || !alloc) { toast({ title: 'Найдите сотрудника и выберите пул', variant: 'destructive' }); return; }
    const { data, error } = await supabase.rpc('b2b_assign_seat', { p_allocation_id: alloc, p_employee_user_id: found.user_id });
    if (error) { toast({ title: 'Ошибка', description: error.message, variant: 'destructive' }); return; }
    const r = data as { ok?: boolean };
    if (r?.ok) {
      toast({ title: 'Место выдано, сотрудник получит уведомление' });
      setEmpQuery(p => ({ ...p, [accId]: '' }));
      setEmpFound(p => ({ ...p, [accId]: null }));
      setEmpAlloc(p => ({ ...p, [accId]: '' }));
      load();
    }
  };

  const deleteAllocation = async (allocId: string, tier: string, used: number) => {
    if (!confirm(`Удалить пул «${tier}»?${used > 0 ? ` У ${used} сотрудников подписка станет неактивной.` : ''}`)) return;
    const { error } = await supabase.rpc('b2b_admin_delete_allocation', { p_allocation_id: allocId });
    if (error) { toast({ title: 'Ошибка', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Пул удалён' });
    load();
  };

  const revokeSeat = async (seatId: string, empName: string | null) => {
    if (!confirm(`Отозвать место у «${empName || 'сотрудника'}»? Подписка станет неактивной.`)) return;
    const { error } = await supabase.rpc('b2b_revoke_seat', { p_seat_id: seatId });
    if (error) { toast({ title: 'Ошибка', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Место отозвано' });
    load();
  };

  const searchOwner = async (accId: string) => {
    const q = (ownerCode[accId] || '').trim();
    if (!q) return;
    setOwnerBusy(p => ({ ...p, [accId]: true }));
    setOwnerFound(p => ({ ...p, [accId]: null }));
    try {
      const { data, error } = await supabase.rpc('find_user_by_public_id', { _public_id: q });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : null;
      if (!row) { toast({ title: 'Пользователь не найден', variant: 'destructive' }); return; }
      setOwnerFound(p => ({ ...p, [accId]: row }));
    } catch (e) {
      toast({ title: 'Ошибка поиска', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    } finally { setOwnerBusy(p => ({ ...p, [accId]: false })); }
  };

  const setOwner = async (accId: string, hasOwner: boolean) => {
    const found = ownerFound[accId];
    if (!found) { toast({ title: 'Найдите пользователя', variant: 'destructive' }); return; }
    if (!confirm(`${hasOwner ? 'Сменить админа бизнеса на' : 'Назначить админом бизнеса'} «${found.name || 'Без имени'}»?\nВесь пул, выдачи и аналитика останутся. Прежний админ (если был) потеряет доступ в кабинет.`)) return;
    const { error } = await supabase.rpc('b2b_admin_set_owner', { p_account_id: accId, p_new_admin_user_id: found.user_id });
    if (error) { toast({ title: 'Ошибка', description: error.message, variant: 'destructive' }); return; }
    toast({ title: hasOwner ? 'Админ бизнеса сменён' : 'Админ бизнеса назначен' });
    setOwnerCode(p => ({ ...p, [accId]: '' }));
    setOwnerFound(p => ({ ...p, [accId]: null }));
    load();
  };

  const revokeOwner = async (accountId: string, ownerName: string | null) => {
    if (!confirm(`Забрать доступ в кабинет у «${ownerName || 'владельца'}»? Данные бизнеса сохранятся, но он больше не сможет войти в кабинет B2B.`)) return;
    const { error } = await supabase.rpc('b2b_admin_revoke_owner', { p_account_id: accountId });
    if (error) { toast({ title: 'Ошибка', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Доступ владельца снят' });
    load();
  };

  const deleteAccount = async (accountId: string, accName: string, used: number) => {
    if (!confirm(`Удалить бизнес «${accName}» полностью?${used > 0 ? ` У ${used} сотрудников подписки станут неактивными.` : ''} Это действие необратимо.`)) return;
    const { error } = await supabase.rpc('b2b_admin_delete_account', { p_account_id: accountId });
    if (error) { toast({ title: 'Ошибка', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Бизнес удалён' });
    load();
  };

  return (
    <AdminLayout title="B2B — Корпоративные подписки">
      <div className="space-y-6">
        {/* Создание аккаунта */}
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><Plus size={18} />Новый бизнес-аккаунт</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label>Название компании</Label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="ООО «Ромашка»" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>Контакт (имя)</Label><Input value={contactName} onChange={e => setContactName(e.target.value)} /></div>
              <div><Label>Контакт (телефон)</Label><Input value={contactPhone} onChange={e => setContactPhone(e.target.value)} /></div>
            </div>
            <div>
              <Label>Админ бизнеса (по ID пользователя subday)</Label>
              <div className="flex gap-2">
                <Input value={adminCode} onChange={e => setAdminCode(e.target.value)} placeholder="6-значный ID" />
                <Button variant="outline" onClick={searchAdmin} disabled={isSearching}>{isSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}</Button>
              </div>
              {foundAdmin && <p className="text-xs text-muted-foreground mt-1">Админ: {foundAdmin.name || 'Без имени'} · {foundAdmin.phone_masked}</p>}
            </div>
            <Button onClick={createAccount} disabled={isCreating}>{isCreating ? 'Создаём…' : 'Создать аккаунт'}</Button>
          </CardContent>
        </Card>

        {/* Список бизнесов */}
        {loading ? (
          <p className="text-sm text-muted-foreground">Загрузка…</p>
        ) : accounts.length === 0 ? (
          <p className="text-sm text-muted-foreground">Бизнес-аккаунтов пока нет.</p>
        ) : (
          <div className="space-y-3">
            {accounts.map(acc => {
              const isOpen = expanded[acc.id];
              const occ = acc.seats_total > 0 ? Math.round((acc.seats_used / acc.seats_total) * 100) : 0;
              return (
                <Card key={acc.id} className={acc.is_active ? '' : 'opacity-60'}>
                  <CardContent className="pt-4 space-y-3">
                    {/* Шапка бизнеса */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <Building2 size={18} className="text-primary shrink-0" />
                        <div className="min-w-0">
                          <p className="font-semibold text-foreground truncate">{acc.name}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {acc.owner_name ? `${acc.owner_name}${acc.owner_public_id ? ` · ID ${acc.owner_public_id}` : ''}` : <span className="text-amber-600">Владелец не назначен</span>}
                          </p>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-bold text-foreground tabular-nums">{acc.seats_used} / {acc.seats_total}</p>
                        <p className="text-[10px] text-muted-foreground">мест занято</p>
                      </div>
                    </div>

                    {/* Прогресс занятости */}
                    <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                      <div className="h-full bg-primary rounded-full" style={{ width: `${occ}%` }} />
                    </div>

                    {/* Пулы (чипы) */}
                    <div className="flex flex-wrap gap-2">
                      {acc.allocations.length === 0 && <span className="text-xs text-muted-foreground">Пулы не выданы</span>}
                      {acc.allocations.map(a => (
                        <span key={a.id} className="inline-flex items-center gap-1.5 text-xs bg-secondary rounded-lg pl-2 pr-1 py-1">
                          <span>{a.tier}: {a.seats_used}/{a.seats_total}</span>
                          <button onClick={() => deleteAllocation(a.id, a.tier, a.seats_used)} className="text-muted-foreground hover:text-destructive p-0.5" title="Удалить пул">
                            <Trash2 size={12} />
                          </button>
                        </span>
                      ))}
                    </div>

                    {/* Выдать пул */}
                    <div className="flex gap-2 items-end border-t pt-3">
                      <div className="flex-1">
                        <Label className="text-xs">Тариф</Label>
                        <Select value={allocTier[acc.id] || ''} onValueChange={v => setAllocTier(p => ({ ...p, [acc.id]: v }))}>
                          <SelectTrigger><SelectValue placeholder="Выберите" /></SelectTrigger>
                          <SelectContent>{subTypes.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                      <div className="w-24">
                        <Label className="text-xs">Мест</Label>
                        <Input type="number" min={1} value={allocSeats[acc.id] || ''} onChange={e => setAllocSeats(p => ({ ...p, [acc.id]: e.target.value }))} placeholder="100" />
                      </div>
                      <Button onClick={() => addAllocation(acc.id)}>Выдать пул</Button>
                    </div>

                    {/* Раскрытие: сотрудники + опасные действия */}
                    <button
                      onClick={() => setExpanded(p => ({ ...p, [acc.id]: !p[acc.id] }))}
                      className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                    >
                      <Users size={13} />
                      Сотрудники ({acc.seats.length}) и управление
                      {isOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                    </button>

                    {isOpen && (
                      <div className="space-y-2 pt-1">
                        {/* Выдать место сотруднику */}
                        <div className="rounded-lg border border-dashed border-border p-3 space-y-2">
                          <div className="flex items-center gap-1.5 text-xs font-medium text-foreground"><UserPlus size={14} className="text-primary" />Выдать место сотруднику</div>
                          {acc.allocations.some(a => a.seats_total - a.seats_used > 0) ? (
                            <>
                              <div className="flex gap-2">
                                <Input
                                  value={empQuery[acc.id] || ''}
                                  onChange={e => setEmpQuery(p => ({ ...p, [acc.id]: e.target.value }))}
                                  placeholder="ID (6 цифр) или телефон"
                                  onKeyDown={e => e.key === 'Enter' && searchEmp(acc.id)}
                                />
                                <Button variant="outline" onClick={() => searchEmp(acc.id)} disabled={empBusy[acc.id]}>
                                  {empBusy[acc.id] ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                                </Button>
                              </div>
                              {empFound[acc.id] && (
                                <div className="rounded-lg bg-secondary p-2 space-y-2">
                                  <p className="text-sm font-medium text-foreground">{empFound[acc.id]!.name || 'Без имени'} <span className="text-xs text-muted-foreground font-normal">{empFound[acc.id]!.phone_masked}</span></p>
                                  <div className="flex gap-2">
                                    <Select value={empAlloc[acc.id] || ''} onValueChange={v => setEmpAlloc(p => ({ ...p, [acc.id]: v }))}>
                                      <SelectTrigger className="flex-1"><SelectValue placeholder="Пул" /></SelectTrigger>
                                      <SelectContent>
                                        {acc.allocations.filter(a => a.seats_total - a.seats_used > 0).map(a => (
                                          <SelectItem key={a.id} value={a.id}>{a.tier} (свободно {a.seats_total - a.seats_used})</SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                    <Button onClick={() => assignEmp(acc.id)}>Выдать</Button>
                                  </div>
                                </div>
                              )}
                            </>
                          ) : (
                            <p className="text-[11px] text-muted-foreground">Нет свободных мест. Добавьте пул выше.</p>
                          )}
                        </div>

                        {acc.seats.length === 0 && <p className="text-xs text-muted-foreground">Мест ещё не выдано.</p>}
                        {acc.seats.map(s => (
                          <div key={s.seat_id} className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2">
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-foreground truncate">
                                {s.name || 'Без имени'}
                                {s.public_id && <span className="text-xs text-muted-foreground font-mono ml-2">ID {s.public_id}</span>}
                              </p>
                              <p className="text-[11px] text-muted-foreground flex items-center gap-2">
                                <span className="px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">{s.tier}</span>
                                <span className="inline-flex items-center gap-1"><Coffee size={10} />{s.redemptions}</span>
                                <span>выдано {fmtDate(s.assigned_at)}</span>
                              </p>
                            </div>
                            <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive shrink-0" onClick={() => revokeSeat(s.seat_id, s.name)} title="Отозвать место">
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        ))}

                        {/* Потраченные места (слот пула израсходован) */}
                        {acc.consumed_seats?.length > 0 && (
                          <div className="space-y-1.5 border-t pt-3">
                            <p className="text-[11px] text-muted-foreground">Использованные места (слот потрачен, в пул не вернулся):</p>
                            {acc.consumed_seats.map(s => (
                              <div key={s.seat_id} className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/40 rounded-lg px-3 py-1.5">
                                <span className="truncate">{s.name || 'Без имени'}{s.public_id && <span className="font-mono ml-1">ID {s.public_id}</span>} · {s.tier}</span>
                                <span className="ml-auto shrink-0">отозвано {fmtDate(s.revoked_at)}</span>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Админ бизнеса (владелец кабинета): сменить/назначить */}
                        <div className="rounded-lg border border-dashed border-border p-3 space-y-2">
                          <div className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                            <Building2 size={14} className="text-primary" />Админ бизнеса (доступ в кабинет)
                          </div>
                          <p className="text-[11px] text-muted-foreground -mt-1">
                            Текущий: {acc.owner_name ? `${acc.owner_name}${acc.owner_public_id ? ` · ID ${acc.owner_public_id}` : ''}` : <span className="text-amber-600">не назначен</span>}. Смена не затрагивает пул, выдачи и аналитику.
                          </p>
                          <div className="flex gap-2">
                            <Input
                              value={ownerCode[acc.id] || ''}
                              onChange={e => setOwnerCode(p => ({ ...p, [acc.id]: e.target.value }))}
                              placeholder="ID нового админа (6 цифр)"
                              onKeyDown={e => e.key === 'Enter' && searchOwner(acc.id)}
                            />
                            <Button variant="outline" onClick={() => searchOwner(acc.id)} disabled={ownerBusy[acc.id]}>
                              {ownerBusy[acc.id] ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                            </Button>
                          </div>
                          {ownerFound[acc.id] && (
                            <div className="flex items-center justify-between gap-2 rounded-lg bg-secondary p-2">
                              <p className="text-sm font-medium text-foreground truncate">{ownerFound[acc.id]!.name || 'Без имени'} <span className="text-xs text-muted-foreground font-normal">{ownerFound[acc.id]!.phone_masked}</span></p>
                              <Button size="sm" onClick={() => setOwner(acc.id, !!acc.admin_user_id)}>{acc.admin_user_id ? 'Сменить' : 'Назначить'}</Button>
                            </div>
                          )}
                        </div>

                        {/* Опасные действия по аккаунту */}
                        <div className="flex flex-wrap gap-2 border-t pt-3">
                          {acc.admin_user_id && (
                            <Button variant="outline" size="sm" className="text-amber-600 border-amber-300 hover:text-amber-700" onClick={() => revokeOwner(acc.id, acc.owner_name)}>
                              <UserMinus className="w-4 h-4 mr-1" />Забрать доступ владельца
                            </Button>
                          )}
                          <Button variant="outline" size="sm" className="text-destructive border-destructive/40 hover:text-destructive" onClick={() => deleteAccount(acc.id, acc.name, acc.seats_used)}>
                            <Trash2 className="w-4 h-4 mr-1" />Удалить бизнес
                          </Button>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
