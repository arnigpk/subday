import { useEffect, useState } from 'react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { Plus, Pencil, Trash2, Coffee, GlassWater, Sparkles, UtensilsCrossed } from 'lucide-react';
import { useAdminAuth } from '@/hooks/useAdminAuth';
import { toast } from '@/hooks/use-toast';
import { COUNTRY_OPTIONS, getCurrencySymbol } from '@/utils/countries';
import { CountryCityFilter } from '@/components/admin/CountryCityFilter';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { SortableItem } from '@/components/admin/SortableItem';
import { getSubscriptionDurationDays, formatDurationLabel } from '@/utils/subscriptionDuration';
import { SubscriptionBadgeEditor, getSubscriptionBadgeStyle } from '@/components/admin/SubscriptionBadgeEditor';
import { SortableFeaturesEditor } from '@/components/admin/SortableFeaturesEditor';

interface SubscriptionType {
  id: string;
  name: string;
  description: string | null;
  type: string;
  cups_count: number;
  price: number;
  duration_days: number;
  is_active: boolean;
  badge: string | null;
  badge_color: string | null;
  sort_order: number;
  created_at: string;
  features: string[] | null;
  exclusions: string[] | null;
  benefit: number | null;
  daily_limit: number | null;
  country: string | null;
  currency: string | null;
}

const DEFAULT_FEATURES = [
  'Любой кофейный напиток',
  'Без ограничений по размеру',
  '1 напиток за визит',
  'Во всех партнёрских кофейнях',
];

export default function AdminSubscriptionsPage() {
  const { canManage } = useAdminAuth();
  const [subscriptions, setSubscriptions] = useState<SubscriptionType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editingSub, setEditingSub] = useState<SubscriptionType | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [deleteSubId, setDeleteSubId] = useState<string | null>(null);
  const [listCountryFilter, setListCountryFilter] = useState('all');
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    type: 'coffee',
    cups_count: 30,
    price: 15000,
    duration_days: 30,
    is_active: true,
    badge: '' as string | null,
    badge_color: null as string | null,
    features: DEFAULT_FEATURES,
    exclusions: [] as string[],
    benefit: 0,
    daily_limit: null as number | null,
    country: 'KZ',
    currency: '₸',
    how_it_works: '',
  });

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  useEffect(() => {
    fetchSubscriptions();
    const channel = supabase
      .channel('subscription_types_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'subscription_types' }, () => fetchSubscriptions())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const fetchSubscriptions = async () => {
    try {
      const { data, error } = await supabase
        .from('subscription_types')
        .select('*')
        .order('sort_order', { ascending: true });

      if (error) throw error;
      setSubscriptions(data || []);
    } catch (error) {
      console.error('Error fetching subscriptions:', error);
      toast({ title: 'Ошибка загрузки подписок', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = subscriptions.findIndex((s) => s.id === active.id);
      const newIndex = subscriptions.findIndex((s) => s.id === over.id);

      const newOrder = arrayMove(subscriptions, oldIndex, newIndex);
      setSubscriptions(newOrder);

      // Update sort_order in database
      try {
        const updates = newOrder.map((sub, index) => ({
          id: sub.id,
          sort_order: index + 1,
        }));

        for (const update of updates) {
          await supabase
            .from('subscription_types')
            .update({ sort_order: update.sort_order })
            .eq('id', update.id);
        }

        toast({ title: 'Порядок сохранён' });
      } catch (error) {
        console.error('Error updating order:', error);
        toast({ title: 'Ошибка сохранения порядка', variant: 'destructive' });
        fetchSubscriptions();
      }
    }
  };

  const openCreateDialog = () => {
    setEditingSub(null);
    setFormData({
      name: '',
      description: '',
      type: 'coffee',
      cups_count: 30,
      price: 15000,
      duration_days: 30,
      is_active: true,
      badge: null,
      badge_color: null,
      features: DEFAULT_FEATURES,
      exclusions: [],
      benefit: 0,
      daily_limit: null,
      country: 'KZ',
      currency: '₸',
      how_it_works: '',
    });
    setIsDialogOpen(true);
  };

  const openEditDialog = (sub: SubscriptionType) => {
    setEditingSub(sub);
    setFormData({
      name: sub.name,
      description: sub.description || '',
      type: sub.type,
      cups_count: sub.cups_count,
      price: sub.price,
      duration_days: sub.duration_days,
      is_active: sub.is_active,
      badge: sub.badge,
      badge_color: sub.badge_color,
      features: sub.features && sub.features.length > 0 ? sub.features : DEFAULT_FEATURES,
      exclusions: (sub as any).exclusions && (sub as any).exclusions.length > 0 ? (sub as any).exclusions : [],
      benefit: sub.benefit || 0,
      daily_limit: sub.daily_limit,
      country: sub.country || 'KZ',
      currency: sub.currency || '₸',
      how_it_works: (sub as any).how_it_works || '',
    });
    setIsDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast({ title: 'Введите название подписки', variant: 'destructive' });
      return;
    }

    try {
      if (editingSub) {
        const { error } = await supabase
          .from('subscription_types')
          .update({
            name: formData.name,
            description: formData.description || null,
            type: formData.type,
            cups_count: formData.cups_count,
            price: formData.price,
            duration_days: formData.duration_days,
            is_active: formData.is_active,
            badge: formData.badge || null,
            badge_color: formData.badge_color || null,
            features: formData.features.filter(f => f.trim() !== ''),
            exclusions: formData.exclusions.filter(f => f.trim() !== ''),
            benefit: formData.benefit > 0 ? formData.benefit : null,
            daily_limit: formData.daily_limit,
            country: formData.country,
            currency: formData.currency,
            how_it_works: formData.how_it_works.trim() || null,
          } as any)
          .eq('id', editingSub.id);

        if (error) throw error;
        toast({ title: 'Подписка обновлена' });
      } else {
        const maxOrder = subscriptions.length > 0 
          ? Math.max(...subscriptions.map(s => s.sort_order)) 
          : 0;
        
        const { error } = await supabase
          .from('subscription_types')
          .insert({
            name: formData.name,
            description: formData.description || null,
            type: formData.type,
            cups_count: formData.cups_count,
            price: formData.price,
            duration_days: formData.duration_days,
            is_active: formData.is_active,
            badge: formData.badge || null,
            badge_color: formData.badge_color || null,
            sort_order: maxOrder + 1,
            features: formData.features.filter(f => f.trim() !== ''),
            exclusions: formData.exclusions.filter(f => f.trim() !== ''),
            benefit: formData.benefit > 0 ? formData.benefit : null,
            daily_limit: formData.daily_limit,
            country: formData.country,
            currency: formData.currency,
            how_it_works: formData.how_it_works.trim() || null,
          } as any);

        if (error) throw error;
        toast({ title: 'Подписка добавлена' });
      }

      setIsDialogOpen(false);
      fetchSubscriptions();
    } catch (error) {
      console.error('Error saving subscription:', error);
      toast({ title: 'Ошибка сохранения', variant: 'destructive' });
    }
  };

  const handleDelete = async () => {
    if (!deleteSubId) return;

    try {
      const { error } = await supabase
        .from('subscription_types')
        .delete()
        .eq('id', deleteSubId);

      if (error) throw error;
      toast({ title: 'Подписка удалена' });
      setDeleteSubId(null);
      fetchSubscriptions();
    } catch (error) {
      console.error('Error deleting subscription:', error);
      toast({ title: 'Ошибка удаления', variant: 'destructive' });
    }
  };

  const formatPrice = (price: number, currency?: string | null) => {
    return new Intl.NumberFormat('ru-RU').format(price) + ' ' + (currency || '₸');
  };

  return (
    <AdminLayout title="Подписки">
      <div className="flex flex-col gap-4 mb-4">
        <div className="flex justify-between items-center">
          <p className="text-sm text-muted-foreground">
            Перетащите карточки для изменения порядка
          </p>
          {canManage && (
            <Button onClick={openCreateDialog}>
              <Plus className="w-4 h-4 mr-2" />
              Добавить подписку
            </Button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={listCountryFilter} onValueChange={setListCountryFilter}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Страна" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все страны</SelectItem>
              {COUNTRY_OPTIONS.map(c => (
                <SelectItem key={c.code} value={c.code}>{c.flag} {c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <div className="h-24 bg-muted animate-pulse rounded" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : subscriptions.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <p className="text-muted-foreground">Нет подписок</p>
            <Button onClick={openCreateDialog} className="mt-4">
              <Plus className="w-4 h-4 mr-2" />
              Добавить первую подписку
            </Button>
          </CardContent>
        </Card>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={subscriptions.map((s) => s.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-3">
              {subscriptions
                .filter(s => listCountryFilter === 'all' || s.country === listCountryFilter)
                .map((sub) => (
                <SortableItem key={sub.id} id={sub.id}>
                  <Card className={!sub.is_active ? 'opacity-50' : ''}>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className="flex items-center gap-2">
                            {sub.type === 'coffee' ? (
                              <Coffee className="w-5 h-5 text-amber-600" />
                            ) : (
                              <UtensilsCrossed className="w-5 h-5 text-purple-600" />
                            )}
                            <div>
                              <h3 className="font-semibold">{sub.name}</h3>
                              <p className="text-sm text-muted-foreground">
                                {sub.cups_count} {sub.type === 'coffee' ? 'кофе' : 'ланчей'} • {formatDurationLabel(sub.duration_days)}
                              </p>
                            </div>
                          </div>
                          {sub.badge && (
                            <span className={`inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full ${getSubscriptionBadgeStyle(sub.badge, sub.badge_color)}`}>
                              <Sparkles size={10} />
                              {sub.badge}
                            </span>
                          )}
                        </div>
                          <div className="flex items-center gap-4">
                            <span className="font-bold text-lg">{formatPrice(sub.price, sub.currency)}</span>
                            {canManage && (
                              <div className="flex gap-1">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => openEditDialog(sub)}
                                >
                                  <Pencil className="w-4 h-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => setDeleteSubId(sub.id)}
                                >
                                  <Trash2 className="w-4 h-4 text-destructive" />
                                </Button>
                              </div>
                            )}
                          </div>
                      </div>
                    </CardContent>
                  </Card>
                </SortableItem>
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {/* Edit/Create Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingSub ? 'Редактировать подписку' : 'Новая подписка'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="name">Название</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="30 кофе"
              />
            </div>
            <div>
              <Label htmlFor="description">Описание</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Любой кофейный напиток каждый день"
              />
            </div>
            <div>
              <Label htmlFor="type">Тип</Label>
              <Select value={formData.type} onValueChange={(v) => setFormData({ ...formData, type: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="coffee">Кофе</SelectItem>
                  <SelectItem value="drinks">Ланч</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <SubscriptionBadgeEditor
              badge={formData.badge}
              badgeColor={formData.badge_color}
              onChange={(badge, color) => setFormData({ ...formData, badge, badge_color: color })}
            />
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="cups_count">Количество</Label>
                <Input
                  id="cups_count"
                  type="number"
                  min="1"
                  value={formData.cups_count}
                  onChange={(e) => {
                    const cups = parseInt(e.target.value) || 1;
                    setFormData({ 
                      ...formData, 
                      cups_count: cups,
                      duration_days: getSubscriptionDurationDays(cups)
                    });
                  }}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  360+ = 1 год, 180+ = 6 мес, иначе 30 дней
                </p>
              </div>
              <div>
                <Label htmlFor="price">Цена ({formData.currency})</Label>
                <Input
                  id="price"
                  type="number"
                  min="0"
                  value={formData.price}
                  onChange={(e) => setFormData({ ...formData, price: parseInt(e.target.value) || 0 })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Страна</Label>
                <Select value={formData.country} onValueChange={(v) => {
                  const cur = getCurrencySymbol(v);
                  setFormData({ ...formData, country: v, currency: cur });
                }}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {COUNTRY_OPTIONS.map(c => <SelectItem key={c.code} value={c.code}>{c.flag} {c.name} ({c.currency})</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Валюта</Label>
                <Input value={formData.currency} disabled className="bg-muted mt-1" />
              </div>
            </div>
            <div>
              <Label htmlFor="duration_days">Срок действия</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="duration_days"
                  type="number"
                  min="1"
                  value={formData.duration_days}
                  onChange={(e) => setFormData({ ...formData, duration_days: parseInt(e.target.value) || 30 })}
                  className="flex-1"
                />
                <span className="text-sm text-muted-foreground whitespace-nowrap">
                  {formatDurationLabel(formData.duration_days)}
                </span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="benefit">За 1 единицу ({formData.currency})</Label>
                <Input
                  id="benefit"
                  type="number"
                  min="0"
                  value={formData.benefit}
                  onChange={(e) => setFormData({ ...formData, benefit: parseInt(e.target.value) || 0 })}
                  placeholder="Цена за 1 единицу"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  "X{formData.currency} за напиток/ланч" в приложении
                </p>
              </div>
              <div>
                <Label htmlFor="daily_limit">Дневной лимит</Label>
                <Select 
                  value={formData.daily_limit?.toString() || 'unlimited'} 
                  onValueChange={(v) => setFormData({ ...formData, daily_limit: v === 'unlimited' ? null : parseInt(v) })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Выбрать лимит" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unlimited">Безлимит</SelectItem>
                    <SelectItem value="2">2 в день</SelectItem>
                    <SelectItem value="5">5 в день</SelectItem>
                    <SelectItem value="7">7 в день</SelectItem>
                    <SelectItem value="10">10 в день</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">
                  Макс. чашек в день
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="is_active"
                checked={formData.is_active}
                onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
              />
              <Label htmlFor="is_active">Активна</Label>
            </div>
            
            <SortableFeaturesEditor
              features={formData.features}
              onChange={(features) => setFormData({ ...formData, features })}
            />
            <SortableFeaturesEditor
              features={formData.exclusions}
              onChange={(exclusions) => setFormData({ ...formData, exclusions })}
              label="Что не входит"
              placeholder="Исключение"
              variant="exclusion"
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                Отмена
              </Button>
              <Button onClick={handleSave}>
                {editingSub ? 'Сохранить' : 'Добавить'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteSubId} onOpenChange={() => setDeleteSubId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить подписку?</AlertDialogTitle>
            <AlertDialogDescription>
              Это действие нельзя отменить. Подписка будет удалена из системы.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
              Удалить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminLayout>
  );
}
