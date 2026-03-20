import { useEffect, useState } from 'react';
import { COUNTRY_OPTIONS, getCitiesForCountry, getCountryLabel } from '@/utils/countries';
import { CountryCityFilter } from '@/components/admin/CountryCityFilter';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { Card, CardContent } from '@/components/ui/card';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { Coffee, MapPin, Clock, Plus, Pencil, Trash2, UtensilsCrossed } from 'lucide-react';
import { useAdminAuth } from '@/hooks/useAdminAuth';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/hooks/use-toast';
import { ShopLogoUpload } from '@/components/admin/ShopLogoUpload';
import { ShopGalleryUpload } from '@/components/admin/ShopGalleryUpload';
import { AddressesEditor, AddressWithCoords } from '@/components/shop/AddressesEditor';
import { BadgesEditor, ShopBadgeData } from '@/components/shop/BadgesEditor';
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
  country: string | null;
  working_hours: string | null;
  is_active: boolean;
  created_at: string;
  logo_url: string | null;
  gallery_urls: string[] | null;
  sort_order: number;
  badge_text: string | null;
  badge_color: string | null;
  badges: unknown;
  coordinates: unknown;
  description: string | null;
  supported_types: string[];
}

interface Coordinate {
  lat: number | null;
  lng: number | null;
}

function parseCoordinates(coords: unknown): Coordinate[] {
  if (!coords || !Array.isArray(coords)) return [];
  return coords.map(c => ({
    lat: typeof c?.lat === 'number' ? c.lat : null,
    lng: typeof c?.lng === 'number' ? c.lng : null,
  }));
}

export default function AdminShopsPage() {
  const { canManage } = useAdminAuth();
  const [shops, setShops] = useState<Shop[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editingShop, setEditingShop] = useState<Shop | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [deleteShopId, setDeleteShopId] = useState<string | null>(null);
  const [listCountryFilter, setListCountryFilter] = useState('all');
  const [listCityFilter, setListCityFilter] = useState('all');
  const [formData, setFormData] = useState({
    name: '',
    addressesWithCoords: [] as AddressWithCoords[],
    country: 'KZ',
    city: 'Атырау',
    working_hours: '09:00-21:00',
    is_active: true,
    logo_url: null as string | null,
    gallery_urls: [] as string[],
    badges: [] as ShopBadgeData[],
    description: '',
    supported_types: ['coffee'] as string[],
  });

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  useEffect(() => {
    fetchShops();
    const channel = supabase
      .channel('shops_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shops' }, () => fetchShops())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
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
      addressesWithCoords: [],
      country: 'KZ',
      city: 'Атырау',
      working_hours: '09:00-21:00',
      is_active: true,
      logo_url: null,
      gallery_urls: [],
      badges: [],
      description: '',
      supported_types: ['coffee'],
    });
    setIsDialogOpen(true);
  };

  const openEditDialog = (shop: Shop) => {
    setEditingShop(shop);
    
    // Parse badges
    let parsedBadges: ShopBadgeData[] = [];
    if (shop.badges && Array.isArray(shop.badges)) {
      parsedBadges = (shop.badges as Array<{ text?: string; color?: string }>)
        .filter(b => b && b.text && b.color)
        .map(b => ({ text: b.text!, color: b.color as 'red' | 'green' | 'yellow' }));
    } else if (shop.badge_text && shop.badge_color) {
      parsedBadges = [{ text: shop.badge_text, color: shop.badge_color as 'red' | 'green' | 'yellow' }];
    }
    
    // Parse addresses with coordinates
    const addresses = shop.addresses || (shop.address ? [shop.address] : []);
    const coords = parseCoordinates(shop.coordinates);
    const addressesWithCoords: AddressWithCoords[] = addresses.map((addr, i) => ({
      address: addr,
      lat: coords[i]?.lat ?? null,
      lng: coords[i]?.lng ?? null,
      working_hours: coords[i]?.working_hours || '',
    }));
    
    setFormData({
      name: shop.name,
      addressesWithCoords,
      country: (shop as any).country || 'KZ',
      city: shop.city || 'Атырау',
      working_hours: shop.working_hours || '09:00-21:00',
      is_active: shop.is_active,
      logo_url: shop.logo_url,
      gallery_urls: shop.gallery_urls || [],
      badges: parsedBadges,
      description: (shop as any).description || '',
      supported_types: shop.supported_types || ['coffee'],
    });
    setIsDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast({ title: 'Введите название кофейни', variant: 'destructive' });
      return;
    }

    try {
      const badgesJson = formData.badges.map(b => ({ text: b.text, color: b.color }));
      const addresses = formData.addressesWithCoords.map(a => a.address);
      const coordinates = formData.addressesWithCoords.map(a => ({
        lat: a.lat,
        lng: a.lng,
      }));
      
      if (editingShop) {
        const { error } = await supabase
          .from('shops')
          .update({
            name: formData.name,
            address: addresses[0] || null,
            addresses,
            coordinates,
            country: formData.country,
            city: formData.city,
            working_hours: formData.working_hours,
            is_active: formData.is_active,
            logo_url: formData.gallery_urls[0] || formData.logo_url,
            gallery_urls: formData.gallery_urls,
            badges: badgesJson,
            badge_text: formData.badges[0]?.text || null,
            badge_color: formData.badges[0]?.color || null,
            description: formData.description.trim() || null,
            supported_types: formData.supported_types,
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
          .insert([{
            name: formData.name,
            address: addresses[0] || null,
            addresses,
            coordinates,
            country: formData.country,
            city: formData.city,
            working_hours: formData.working_hours,
            is_active: formData.is_active,
            logo_url: formData.gallery_urls[0] || formData.logo_url,
            gallery_urls: formData.gallery_urls,
            badges: badgesJson,
            badge_text: formData.badges[0]?.text || null,
            badge_color: formData.badges[0]?.color || null,
            description: formData.description.trim() || null,
            sort_order: maxOrder + 1,
            supported_types: formData.supported_types,
          }]);

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
      <div className="flex flex-col gap-4 mb-4">
        <div className="flex justify-between items-center">
          <p className="text-sm text-muted-foreground">
            Перетащите карточки для изменения порядка
          </p>
          {canManage && (
            <Button onClick={openCreateDialog}>
              <Plus className="w-4 h-4 mr-2" />
              Добавить кофейню
            </Button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <CountryCityFilter
            countryFilter={listCountryFilter}
            cityFilter={listCityFilter}
            onCountryChange={setListCountryFilter}
            onCityChange={setListCityFilter}
          />
        </div>
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
              {shops
                .filter(s => {
                  if (listCountryFilter !== 'all' && s.country !== listCountryFilter) return false;
                  if (listCityFilter !== 'all' && s.city !== listCityFilter) return false;
                  return true;
                })
                .map((shop) => (
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
                        {canManage && (
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
                        )}
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
        <DialogContent className="max-h-[90vh] overflow-y-auto">
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
              addresses={formData.addressesWithCoords}
              onChange={(addressesWithCoords) => setFormData({ ...formData, addressesWithCoords })}
            />
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Страна</Label>
                <Select value={formData.country} onValueChange={(v) => {
                  const cities = getCitiesForCountry(v);
                  setFormData({ ...formData, country: v, city: cities[0] || '' });
                }}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {COUNTRY_OPTIONS.map(c => (
                      <SelectItem key={c.code} value={c.code}>{c.flag} {c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Город</Label>
                <Select value={formData.city} onValueChange={(v) => setFormData({ ...formData, city: v })}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Выберите город" />
                  </SelectTrigger>
                  <SelectContent>
                    {getCitiesForCountry(formData.country).map(city => (
                      <SelectItem key={city} value={city}>{city}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
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
            <ShopGalleryUpload
              currentGalleryUrls={formData.gallery_urls}
              onGalleryChange={(urls) => setFormData({ ...formData, gallery_urls: urls })}
              shopId={editingShop?.id}
              maxImages={4}
              maxSizeMb={15}
            />
            <div>
              <Label htmlFor="description">О кофейне</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Расскажите о вашей кофейне..."
                rows={3}
              />
            </div>
            <BadgesEditor
              badges={formData.badges}
              onChange={(badges) => setFormData({ ...formData, badges })}
            />
            <div>
              <Label className="mb-2 block">Поддерживаемые типы</Label>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.supported_types.includes('coffee')}
                    onChange={(e) => {
                      const types = e.target.checked
                        ? [...formData.supported_types, 'coffee']
                        : formData.supported_types.filter(t => t !== 'coffee');
                      setFormData({ ...formData, supported_types: types.length > 0 ? types : ['coffee'] });
                    }}
                    className="w-4 h-4 rounded border-border"
                  />
                  <Coffee className="w-4 h-4 text-amber-600" />
                  <span className="text-sm">Кофе</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.supported_types.includes('drinks')}
                    onChange={(e) => {
                      const types = e.target.checked
                        ? [...formData.supported_types, 'drinks']
                        : formData.supported_types.filter(t => t !== 'drinks');
                      setFormData({ ...formData, supported_types: types.length > 0 ? types : ['coffee'] });
                    }}
                    className="w-4 h-4 rounded border-border"
                  />
                  <UtensilsCrossed className="w-4 h-4 text-purple-600" />
                  <span className="text-sm">Ланч</span>
                </label>
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
