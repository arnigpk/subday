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
  DialogTrigger,
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

interface Shop {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  working_hours: string | null;
  is_active: boolean;
  created_at: string;
}

export default function AdminShopsPage() {
  const [shops, setShops] = useState<Shop[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editingShop, setEditingShop] = useState<Shop | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [deleteShopId, setDeleteShopId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    address: '',
    city: 'Атырау',
    working_hours: '09:00-21:00',
    is_active: true,
  });

  useEffect(() => {
    fetchShops();
  }, []);

  const fetchShops = async () => {
    try {
      const { data, error } = await supabase
        .from('shops')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setShops(data || []);
    } catch (error) {
      console.error('Error fetching shops:', error);
      toast({ title: 'Ошибка загрузки кофеен', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  const openCreateDialog = () => {
    setEditingShop(null);
    setFormData({
      name: '',
      address: '',
      city: 'Атырау',
      working_hours: '09:00-21:00',
      is_active: true,
    });
    setIsDialogOpen(true);
  };

  const openEditDialog = (shop: Shop) => {
    setEditingShop(shop);
    setFormData({
      name: shop.name,
      address: shop.address || '',
      city: shop.city || 'Атырау',
      working_hours: shop.working_hours || '09:00-21:00',
      is_active: shop.is_active,
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
            address: formData.address || null,
            city: formData.city,
            working_hours: formData.working_hours,
            is_active: formData.is_active,
          })
          .eq('id', editingShop.id);

        if (error) throw error;
        toast({ title: 'Кофейня обновлена' });
      } else {
        const { error } = await supabase
          .from('shops')
          .insert({
            name: formData.name,
            address: formData.address || null,
            city: formData.city,
            working_hours: formData.working_hours,
            is_active: formData.is_active,
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
      <div className="flex justify-end mb-4">
        <Button onClick={openCreateDialog}>
          <Plus className="w-4 h-4 mr-2" />
          Добавить кофейню
        </Button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <div className="h-32 bg-muted animate-pulse rounded" />
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {shops.map((shop) => (
            <Card key={shop.id} className={!shop.is_active ? 'opacity-50' : ''}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Coffee className="w-5 h-5 text-primary" />
                      {shop.name}
                    </CardTitle>
                    {!shop.is_active && (
                      <span className="text-xs text-muted-foreground">Неактивна</span>
                    )}
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
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-sm">
                  {shop.address && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <MapPin className="w-4 h-4" />
                      <span>{shop.address}</span>
                    </div>
                  )}
                  {shop.working_hours && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Clock className="w-4 h-4" />
                      <span>{shop.working_hours}</span>
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground pt-2">
                    Добавлена: {new Date(shop.created_at).toLocaleDateString('ru-RU')}
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
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
            <div>
              <Label htmlFor="address">Адрес</Label>
              <Input
                id="address"
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                placeholder="ул. Сатпаева 20"
              />
            </div>
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
