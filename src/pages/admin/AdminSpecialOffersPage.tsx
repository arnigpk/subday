import { useState, useEffect } from 'react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Plus, Pencil, Trash2, Gift } from 'lucide-react';
import { toast } from 'sonner';
import { COUNTRY_OPTIONS, getCountryLabel } from '@/utils/countries';
import { CountryCityFilter } from '@/components/admin/CountryCityFilter';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface SpecialOffer {
  id: string;
  name: string;
  description: string | null;
  target_subscription_type_id: string | null;
  offer_price: number;
  offer_cups_count: number;
  offer_duration_days: number;
  badge_text: string | null;
  eligibility_type: string;
  eligibility_days: number;
  offer_valid_days: number | null;
  is_active: boolean;
  created_at: string;
}

interface SubscriptionType {
  id: string;
  name: string;
  type: string;
}

const defaultForm = {
  name: '',
  description: '',
  target_subscription_type_id: '',
  offer_price: 0,
  offer_cups_count: 0,
  offer_duration_days: 7,
  badge_text: '-50%',
  eligibility_type: 'new_users',
  eligibility_days: 0,
  offer_valid_days: 0,
  is_active: true,
  country: '',
  max_redemptions_per_user: 1,
};

export default function AdminSpecialOffersPage() {
  const [offers, setOffers] = useState<SpecialOffer[]>([]);
  const [subscriptionTypes, setSubscriptionTypes] = useState<SubscriptionType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingOffer, setEditingOffer] = useState<SpecialOffer | null>(null);
  const [form, setForm] = useState(defaultForm);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    const [offersRes, typesRes] = await Promise.all([
      supabase.from('special_offers').select('*').order('created_at', { ascending: false }),
      supabase.from('subscription_types').select('id, name, type').eq('is_active', true),
    ]);
    if (offersRes.data) setOffers(offersRes.data as SpecialOffer[]);
    if (typesRes.data) setSubscriptionTypes(typesRes.data);
    setIsLoading(false);
  };

  const openCreate = () => {
    setEditingOffer(null);
    setForm(defaultForm);
    setDialogOpen(true);
  };

  const openEdit = (offer: SpecialOffer) => {
    setEditingOffer(offer);
    setForm({
      name: offer.name,
      description: offer.description || '',
      target_subscription_type_id: offer.target_subscription_type_id || '',
      offer_price: offer.offer_price,
      offer_cups_count: offer.offer_cups_count,
      offer_duration_days: offer.offer_duration_days,
      badge_text: offer.badge_text || '',
      eligibility_type: offer.eligibility_type,
      eligibility_days: offer.eligibility_days,
      offer_valid_days: offer.offer_valid_days || 0,
      is_active: offer.is_active,
      country: (offer as any).country || '',
      max_redemptions_per_user: (offer as any).max_redemptions_per_user ?? 1,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name || !form.target_subscription_type_id) {
      toast.error('Заполните название и целевую подписку');
      return;
    }
    if (!form.eligibility_days && !form.offer_valid_days) {
      toast.error('Заполните хотя бы одно из полей: «Дней для eligible» или «Срок действия (дней)»');
      return;
    }

    const payload = {
      name: form.name,
      description: form.description || null,
      target_subscription_type_id: form.target_subscription_type_id,
      offer_price: form.offer_price,
      offer_cups_count: form.offer_cups_count,
      offer_duration_days: form.offer_duration_days,
      badge_text: form.badge_text || null,
      eligibility_type: form.eligibility_type,
      eligibility_days: form.eligibility_days,
      offer_valid_days: form.offer_valid_days || null,
      is_active: form.is_active,
      country: form.country || null,
      max_redemptions_per_user: form.max_redemptions_per_user,
    };

    if (editingOffer) {
      const { error } = await supabase.from('special_offers').update(payload).eq('id', editingOffer.id);
      if (error) { toast.error('Ошибка сохранения'); return; }
      toast.success('Предложение обновлено');
    } else {
      const { error } = await supabase.from('special_offers').insert(payload);
      if (error) { toast.error('Ошибка создания'); return; }
      toast.success('Предложение создано');
    }

    setDialogOpen(false);
    fetchData();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Удалить спецпредложение?')) return;
    const { error } = await supabase.from('special_offers').delete().eq('id', id);
    if (error) { toast.error('Ошибка удаления'); return; }
    toast.success('Удалено');
    fetchData();
  };

  const handleToggle = async (id: string, isActive: boolean) => {
    await supabase.from('special_offers').update({ is_active: isActive }).eq('id', id);
    fetchData();
  };

  const eligibilityLabels: Record<string, string> = {
    new_users: 'Новые пользователи',
    all_users: 'Все пользователи',
    no_subscription: 'Без активной подписки',
    expiring_soon: 'Осталось ≤5 дней',
  };

  const formatPrice = (p: number) => new Intl.NumberFormat('ru-RU').format(p);

  return (
    <AdminLayout title="Спецпредложения">
      <div className="space-y-4">
        <Button onClick={openCreate} className="gap-2">
          <Plus size={16} /> Создать предложение
        </Button>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2].map(i => <div key={i} className="h-24 bg-muted rounded-xl animate-pulse" />)}
          </div>
        ) : offers.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Gift className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>Нет спецпредложений</p>
          </div>
        ) : (
          <div className="space-y-3">
            {offers.map(offer => {
              const subType = subscriptionTypes.find(s => s.id === offer.target_subscription_type_id);
              return (
                <div key={offer.id} className="bg-card border border-border rounded-xl p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-bold text-foreground">{offer.name}</h3>
                        {offer.badge_text && (
                          <span className="px-2 py-0.5 text-xs font-bold bg-accent/10 text-accent rounded-full">
                            {offer.badge_text}
                          </span>
                        )}
                      </div>
                      {offer.description && (
                        <p className="text-sm text-muted-foreground mb-2">{offer.description}</p>
                      )}
                      <div className="flex flex-wrap gap-2 text-xs">
                        <span className="px-2 py-1 bg-muted rounded-lg">
                          Цена: {formatPrice(offer.offer_price)} ₸
                        </span>
                        <span className="px-2 py-1 bg-muted rounded-lg">
                          {offer.offer_cups_count} шт. / {offer.offer_duration_days} дн.
                        </span>
                        <span className="px-2 py-1 bg-muted rounded-lg">
                          {eligibilityLabels[offer.eligibility_type] || offer.eligibility_type}
                        </span>
                        <span className="px-2 py-1 bg-muted rounded-lg">
                          Лимит: {(offer as any).max_redemptions_per_user === 0 ? '∞' : `${(offer as any).max_redemptions_per_user ?? 1}×`}
                        </span>
                        <span className="px-2 py-1 bg-muted rounded-lg">
                          Подписка: {subType?.name || '—'}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch checked={offer.is_active} onCheckedChange={(v) => handleToggle(offer.id, v)} />
                      <Button variant="ghost" size="icon" onClick={() => openEdit(offer)}>
                        <Pencil size={16} />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(offer.id)}>
                        <Trash2 size={16} className="text-destructive" />
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingOffer ? 'Редактировать предложение' : 'Новое предложение'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-1 block">Название</label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Описание</label>
              <Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Целевая подписка</label>
              <Select value={form.target_subscription_type_id} onValueChange={v => setForm(f => ({ ...f, target_subscription_type_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Выберите подписку" /></SelectTrigger>
                <SelectContent>
                  {subscriptionTypes.map(s => (
                    <SelectItem key={s.id} value={s.id}>{s.name} ({s.type})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-sm font-medium mb-1 block">Цена ₸</label>
                <Input type="number" value={form.offer_price} onChange={e => setForm(f => ({ ...f, offer_price: Number(e.target.value) }))} />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Кол-во</label>
                <Input type="number" value={form.offer_cups_count} onChange={e => setForm(f => ({ ...f, offer_cups_count: Number(e.target.value) }))} />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Дней</label>
                <Input type="number" value={form.offer_duration_days} onChange={e => setForm(f => ({ ...f, offer_duration_days: Number(e.target.value) }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium mb-1 block">Бейдж</label>
                <Input value={form.badge_text} onChange={e => setForm(f => ({ ...f, badge_text: e.target.value }))} placeholder="-50%" />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Дней для eligible</label>
                <Input type="number" value={form.eligibility_days} onChange={e => setForm(f => ({ ...f, eligibility_days: Number(e.target.value) }))} />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Срок действия (дней)</label>
              <Input type="number" value={form.offer_valid_days} onChange={e => setForm(f => ({ ...f, offer_valid_days: Number(e.target.value) }))} placeholder="Например: 14" />
              <p className="text-xs text-muted-foreground mt-1">Одно из двух полей обязательно: «Дней для eligible» или «Срок действия»</p>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Тип аудитории</label>
              <Select value={form.eligibility_type} onValueChange={v => setForm(f => ({ ...f, eligibility_type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="new_users">Новые пользователи</SelectItem>
                  <SelectItem value="all_users">Все пользователи</SelectItem>
                  <SelectItem value="no_subscription">Без активной подписки</SelectItem>
                  <SelectItem value="expiring_soon">Осталось ≤5 дней до конца подписки</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Лимит использования (на 1 пользователя)</label>
              <Select value={String(form.max_redemptions_per_user)} onValueChange={v => setForm(f => ({ ...f, max_redemptions_per_user: Number(v) }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1 раз</SelectItem>
                  <SelectItem value="2">2 раза</SelectItem>
                  <SelectItem value="3">3 раза</SelectItem>
                  <SelectItem value="5">5 раз</SelectItem>
                  <SelectItem value="0">Безлимит</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Страна</label>
              <Select value={form.country || 'all'} onValueChange={v => setForm(f => ({ ...f, country: v === 'all' ? '' : v }))}>
                <SelectTrigger><SelectValue placeholder="Все страны" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Все страны</SelectItem>
                  {COUNTRY_OPTIONS.map(c => <SelectItem key={c.code} value={c.code}>{c.flag} {c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.is_active} onCheckedChange={v => setForm(f => ({ ...f, is_active: v }))} />
              <span className="text-sm">Активно</span>
            </div>
            <Button onClick={handleSave} className="w-full">Сохранить</Button>
          </div>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
