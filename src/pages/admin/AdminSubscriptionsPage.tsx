import { useEffect, useState } from 'react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { Plus, Pencil, Trash2, Coffee, GlassWater } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface SubscriptionType {
  id: string;
  name: string;
  description: string | null;
  type: string;
  cups_count: number;
  price: number;
  duration_days: number;
  is_active: boolean;
  created_at: string;
}

export default function AdminSubscriptionsPage() {
  const [subscriptions, setSubscriptions] = useState<SubscriptionType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editingSub, setEditingSub] = useState<SubscriptionType | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [deleteSubId, setDeleteSubId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    type: 'coffee',
    cups_count: 30,
    price: 15000,
    duration_days: 30,
    is_active: true,
  });

  useEffect(() => {
    fetchSubscriptions();
  }, []);

  const fetchSubscriptions = async () => {
    try {
      const { data, error } = await supabase
        .from('subscription_types')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setSubscriptions(data || []);
    } catch (error) {
      console.error('Error fetching subscriptions:', error);
      toast({ title: 'Ошибка загрузки подписок', variant: 'destructive' });
    } finally {
      setIsLoading(false);
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
          })
          .eq('id', editingSub.id);

        if (error) throw error;
        toast({ title: 'Подписка обновлена' });
      } else {
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
          });

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

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('ru-RU').format(price) + ' ₸';
  };

  return (
    <AdminLayout title="Подписки">
      <div className="flex justify-end mb-4">
        <Button onClick={openCreateDialog}>
          <Plus className="w-4 h-4 mr-2" />
          Добавить подписку
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {subscriptions.map((sub) => (
            <Card key={sub.id} className={!sub.is_active ? 'opacity-50' : ''}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-lg flex items-center gap-2">
                      {sub.type === 'coffee' ? (
                        <Coffee className="w-5 h-5 text-amber-600" />
                      ) : (
                        <GlassWater className="w-5 h-5 text-purple-600" />
                      )}
                      {sub.name}
                    </CardTitle>
                    {!sub.is_active && (
                      <span className="text-xs text-muted-foreground">Неактивна</span>
                    )}
                  </div>
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
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {sub.description && (
                    <p className="text-sm text-muted-foreground">{sub.description}</p>
                  )}
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">
                      {sub.cups_count} {sub.type === 'coffee' ? 'кофе' : 'напитков'}
                    </span>
                    <span className="font-bold text-lg">{formatPrice(sub.price)}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Срок: {sub.duration_days} дней
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
                placeholder="Кофейный марафон"
              />
            </div>
            <div>
              <Label htmlFor="description">Описание</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="30 чашек кофе на месяц"
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
                  <SelectItem value="drinks">Напитки</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="cups_count">Количество</Label>
                <Input
                  id="cups_count"
                  type="number"
                  min="1"
                  value={formData.cups_count}
                  onChange={(e) => setFormData({ ...formData, cups_count: parseInt(e.target.value) || 1 })}
                />
              </div>
              <div>
                <Label htmlFor="price">Цена (₸)</Label>
                <Input
                  id="price"
                  type="number"
                  min="0"
                  value={formData.price}
                  onChange={(e) => setFormData({ ...formData, price: parseInt(e.target.value) || 0 })}
                />
              </div>
            </div>
            <div>
              <Label htmlFor="duration_days">Срок действия (дней)</Label>
              <Input
                id="duration_days"
                type="number"
                min="1"
                value={formData.duration_days}
                onChange={(e) => setFormData({ ...formData, duration_days: parseInt(e.target.value) || 30 })}
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
