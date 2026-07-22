import { useState, useEffect } from 'react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Building2, Plus, Search, Loader2 } from 'lucide-react';

interface Account { id: string; name: string; admin_user_id: string; contact_name: string | null; contact_phone: string | null; created_at: string; }
interface Allocation { id: string; account_id: string; subscription_type_id: string; seats_total: number; }
interface SubType { id: string; name: string; }

export default function AdminB2BPage() {
  const { toast } = useToast();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [allocations, setAllocations] = useState<Allocation[]>([]);
  const [subTypes, setSubTypes] = useState<SubType[]>([]);

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

  const load = async () => {
    const [accRes, allocRes, stRes] = await Promise.all([
      supabase.from('b2b_accounts').select('*').order('created_at', { ascending: false }),
      supabase.from('b2b_allocations').select('id, account_id, subscription_type_id, seats_total'),
      supabase.from('subscription_types').select('id, name').eq('is_active', true).order('price'),
    ]);
    setAccounts((accRes.data as Account[]) || []);
    setAllocations((allocRes.data as Allocation[]) || []);
    setSubTypes((stRes.data as SubType[]) || []);
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

  const tierName = (id: string) => subTypes.find(s => s.id === id)?.name || id;

  return (
    <AdminLayout title="B2B — Корпоративные подписки">
      <div className="space-y-6">
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

        <div className="space-y-3">
          {accounts.map(acc => {
            const accAllocs = allocations.filter(a => a.account_id === acc.id);
            return (
              <Card key={acc.id}>
                <CardContent className="pt-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <Building2 size={18} className="text-primary" />
                    <p className="font-semibold text-foreground">{acc.name}</p>
                  </div>
                  {acc.contact_name && <p className="text-xs text-muted-foreground">{acc.contact_name} · {acc.contact_phone}</p>}
                  <div className="flex flex-wrap gap-2">
                    {accAllocs.length === 0 && <span className="text-xs text-muted-foreground">Пулы не выданы</span>}
                    {accAllocs.map(a => (
                      <span key={a.id} className="text-xs bg-secondary rounded-lg px-2 py-1">{tierName(a.subscription_type_id)}: {a.seats_total} мест</span>
                    ))}
                  </div>
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
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </AdminLayout>
  );
}
