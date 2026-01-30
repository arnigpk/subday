import { useEffect, useState } from 'react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
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
import { supabase } from '@/integrations/supabase/client';
import { Coffee, MapPin, Clock, Plus, Pencil, Trash2 } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { ShopLogoUpload } from '@/components/admin/ShopLogoUpload';
import { AddressesEditor } from '@/components/shop/AddressesEditor';
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

interface Shop {
  id: string;
  name: string;
  address: string | null;
  addresses: string[] | null;
  city: string | null;
  working_hours: string | null;
  is_active: boolean;
  created_at: string;
  logo_url: string | null;
  sort_order: number;
  badge_text: string | null;
  badge_color: string | null;
}

export default function AdminShopsPage() {
  const [shops, setShops] = useState<Shop[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editingShop, setEditingShop] = useState<Shop | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [deleteShopId, setDeleteShopId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    addresses: [] as string[],
    city: 'Атырау',
    working_hours: '09:00-21:00',
    is_active: true,
    logo_url: null as string | null,
    badge_text: '',
    badge_color: '' as string,
  });

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  useEffect(() => {
    fetchShops();
  }, []);

  const fetchShops = async () => {
    try {
      const { data, error } = await supabase
        .from('shops')
        .select('*')
        .order('sort_order', { ascending: true });

      if (error) throw error;
      setShops(data || []);
    } catch (error) {
      console.error('Error fetching shops:', error);
      toast({ title: 'Ошибка загрузки кофеен', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = shops.findIndex((s) => s.id === active.id);
      const newIndex = shops.findIndex((s) => s.id === over.id);

      const newOrder = arrayMove(shops, oldIndex, newIndex);
      setShops(newOrder);

      // Update sort_order in database
      try {
        const updates = newOrder.map((shop, index) => ({
          id: shop.id,
          sort_order: index + 1,
        }));

        for (const update of updates) {
          await supabase
            .from('shops')
            .update({ sort_order: update.sort_order })
            .eq('id', update.id);
        }

        toast({ title: 'Порядок сохранён' });
      } catch (error) {
        console.error('Error updating order:', error);
        toast({ title: 'Ошибка сохранения порядка', variant: 'destructive' });
        fetchShops();
      }
    }
  };

  const openCreateDialog = () => {
    setEditingShop(null);
    setFormData({
      name: '',
      addresses: [],
      city: 'Атырау',
      working_hours: '09:00-21:00',
      is_active: true,
      logo_url: null,
      badge_text: '',
      badge_color: '',
    });
    setIsDialogOpen(true);
  };

  const openEditDialog = (shop: Shop) => {
    setEditingShop(shop);
    setFormData({
      name: shop.name,
      addresses: shop.addresses || (shop.address ? [shop.address] : []),
      city: shop.city || 'Атырау',
      working_hours: shop.working_hours || '09:00-21:00',
      is_active: shop.is_active,
      logo_url: shop.logo_url,
      badge_text: shop.badge_text || '',
      badge_color: shop.badge_color || '',
    });
    setIsDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast({ title: 'Введите название кофейни', variant: 'destructive' });
      return;
    }

    try {
      if (editingShop) {
        const { error } = await supabase
          .from('shops')
          .update({
            name: formData.name,
            address: formData.addresses[0] || null,
            addresses: formData.addresses,
            city: formData.city,
            working_hours: formData.working_hours,
            is_active: formData.is_active,
            logo_url: formData.logo_url,
            badge_text: formData.badge_text || null,
            badge_color: formData.badge_color || null,
          })
          .eq('id', editingShop.id);

        if (error) throw error;
        toast({ title: 'Кофейня обновлена' });
      } else {
        const maxOrder = shops.length > 0 
          ? Math.max(...shops.map(s => s.sort_order)) 
          : 0;

        const { error } = await supabase
          .from('shops')
          .insert({
            name: formData.name,
            address: formData.addresses[0] || null,
            addresses: formData.addresses,
            city: formData.city,
            working_hours: formData.working_hours,
            is_active: formData.is_active,
            logo_url: formData.logo_url,
            badge_text: formData.badge_text || null,
            badge_color: formData.badge_color || null,
            sort_order: maxOrder + 1,
          });

        if (error) throw error;
        toast({ title: 'Кофейня добавлена' });
      }

      setIsDialogOpen(false);
      fetchShops();
    } catch (error) {
      console.error('Error saving shop:', error);
      toast({ title: 'Ошибка сохранения', variant: 'destructive' });
    }
  };

  const handleDelete = async () => {
    if (!deleteShopId) return;

    try {
      const { error } = await supabase
        .from('shops')
        .delete()
        .eq('id', deleteShopId);

      if (error) throw error;
      toast({ title: 'Кофейня удалена' });
      setDeleteShopId(null);
      fetchShops();
    } catch (error) {
      console.error('Error deleting shop:', error);
      toast({ title: 'Ошибка удаления', variant: 'destructive' });
    }
  };

  return (
    <AdminLayout title="Кофейни">
      <div className="flex justify-between items-center mb-4">
        <p className="text-sm text-muted-foreground">
          Перетащите карточки для изменения порядка
        </p>
        <Button onClick={openCreateDialog}>
          <Plus className="w-4 h-4 mr-2" />
          Добавить кофейню
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <div className="h-20 bg-muted animate-pulse rounded" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : shops.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <p className="text-muted-foreground">Нет кофеен</p>
            <Button onClick={openCreateDialog} className="mt-4">
              <Plus className="w-4 h-4 mr-2" />
              Добавить первую кофейню
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
            items={shops.map((s) => s.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-3">
              {shops.map((shop) => (
                <SortableItem key={shop.id} id={shop.id}>
                  <Card className={!shop.is_active ? 'opacity-50' : ''}>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          {shop.logo_url ? (
                            <img src={shop.logo_url} alt={shop.name} className="w-12 h-12 rounded-lg object-cover" />
                          ) : (
                            <div className="w-12 h-12 rounded-lg bg-secondary flex items-center justify-center">
                              <Coffee className="w-6 h-6 text-primary" />
                            </div>
                          )}
                          <div>
                            <h3 className="font-semibold flex items-center gap-2">
                              {shop.name}
                              {!shop.is_active && (
                                <span className="text-xs text-muted-foreground font-normal">(Неактивна)</span>
                              )}
                            </h3>
                            <div className="flex items-center gap-4 text-sm text-muted-foreground">
                              {shop.address && (
                                <span className="flex items-center gap-1">
                                  <MapPin className="w-3 h-3" />
                                  {shop.address}
                                </span>
                              )}
                              {shop.working_hours && (
                                <span className="flex items-center gap-1">
                                  <Clock className="w-3 h-3" />
                                  {shop.working_hours}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openEditDialog(shop)}
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setDeleteShopId(shop.id)}
                          >
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
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
              {editingShop ? 'Редактировать кофейню' : 'Новая кофейня'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="name">Название</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Coffee Room"
              />
            </div>
            <AddressesEditor
              addresses={formData.addresses}
              onChange={(addresses) => setFormData({ ...formData, addresses })}
            />
            <div>
              <Label htmlFor="city">Город</Label>
              <Input
                id="city"
                value={formData.city}
                onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                placeholder="Атырау"
              />
            </div>
            <div>
              <Label htmlFor="working_hours">Часы работы</Label>
              <Input
                id="working_hours"
                value={formData.working_hours}
                onChange={(e) => setFormData({ ...formData, working_hours: e.target.value })}
                placeholder="09:00-21:00"
              />
            </div>
            <ShopLogoUpload
              currentLogoUrl={formData.logo_url}
              onLogoChange={(url) => setFormData({ ...formData, logo_url: url })}
              shopId={editingShop?.id}
              label="Фото"
              maxSizeMb={10}
            />
            <div className="space-y-2">
              <Label>Бейдж (необязательно)</Label>
              <div className="flex gap-2">
                <Input
                  value={formData.badge_text}
                  onChange={(e) => setFormData({ ...formData, badge_text: e.target.value })}
                  placeholder="Текст бейджа"
                  maxLength={15}
                  className="flex-1"
                />
                <select
                  value={formData.badge_color}
                  onChange={(e) => setFormData({ ...formData, badge_color: e.target.value })}
                  className="h-10 px-3 rounded-md border border-input bg-background text-sm"
                >
                  <option value="">Без цвета</option>
                  <option value="red">🔴 Красный</option>
                  <option value="green">🟢 Зелёный</option>
                  <option value="yellow">🟡 Жёлтый</option>
                </select>
              </div>
              <p className="text-xs text-muted-foreground">Короткий текст, например: "Новинка", "Акция", "ТОП"</p>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="is_active"
                checked={formData.is_active}
                onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
              />
              <Label htmlFor="is_active">Активна</Label>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                Отмена
              </Button>
              <Button onClick={handleSave}>
                {editingShop ? 'Сохранить' : 'Добавить'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteShopId} onOpenChange={() => setDeleteShopId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить кофейню?</AlertDialogTitle>
            <AlertDialogDescription>
              Это действие нельзя отменить. Кофейня будет удалена из системы.
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
