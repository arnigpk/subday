import { useState, useEffect } from 'react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, Image, Loader2, Eye, MousePointer, CalendarIcon } from 'lucide-react';
import { compressImage } from '@/utils/imageCompression';
import { COUNTRY_OPTIONS, getCitiesForCountry } from '@/utils/countries';
import { CountryCityFilter } from '@/components/admin/CountryCityFilter';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { CountryCityFilter } from '@/components/admin/CountryCityFilter';

interface AdBanner {
  id: string;
  image_url: string;
  caption: string | null;
  shop_id: string | null;
  external_url: string | null;
  is_active: boolean;
  sort_order: number;
  autoplay_delay: number;
  display_location: string;
  created_at: string;
}

interface Shop {
  id: string;
  name: string;
}

interface BannerStats {
  banner_id: string;
  views: number;
  clicks: number;
}

const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15MB

export default function AdminBannersPage() {
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingBanner, setEditingBanner] = useState<AdBanner | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [listCountryFilter, setListCountryFilter] = useState('all');
  const [listCityFilter, setListCityFilter] = useState('all');
  const [formData, setFormData] = useState({
    image_url: '',
    caption: '',
    shop_id: '',
    external_url: '',
    is_active: true,
    sort_order: 0,
    autoplay_delay: 4,
    display_location: 'shops',
    country: '',
    city: '',
  });

  const { data: banners = [], isLoading: bannersLoading } = useQuery({
    queryKey: ['admin-banners'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ad_banners')
        .select('*')
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return data as AdBanner[];
    },
  });

  const { data: shops = [] } = useQuery({
    queryKey: ['admin-shops-list'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('shops')
        .select('id, name')
        .eq('is_active', true)
        .order('name');
      if (error) throw error;
      return data as Shop[];
    },
  });

  const { data: bannerStats = [] } = useQuery({
    queryKey: ['admin-banner-stats'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ad_banner_events')
        .select('banner_id, event_type');
      
      if (error) throw error;
      
      // Aggregate stats
      const statsMap = new Map<string, { views: number; clicks: number }>();
      
      data?.forEach((event: { banner_id: string; event_type: string }) => {
        const current = statsMap.get(event.banner_id) || { views: 0, clicks: 0 };
        if (event.event_type === 'view') {
          current.views++;
        } else if (event.event_type === 'click') {
          current.clicks++;
        }
        statsMap.set(event.banner_id, current);
      });
      
      return Array.from(statsMap.entries()).map(([banner_id, stats]) => ({
        banner_id,
        ...stats,
      })) as BannerStats[];
    },
  });

  const getStats = (bannerId: string) => {
    const stats = bannerStats.find(s => s.banner_id === bannerId);
    return stats || { views: 0, clicks: 0 };
  };

  const resetForm = () => {
    setFormData({
      image_url: '',
      caption: '',
      shop_id: '',
      external_url: '',
      is_active: true,
      sort_order: banners.length,
      autoplay_delay: 4,
      display_location: 'shops',
      country: '',
      city: '',
    });
    setEditingBanner(null);
  };

  const openCreateDialog = () => {
    resetForm();
    setFormData(prev => ({ ...prev, sort_order: banners.length }));
    setIsDialogOpen(true);
  };

  const openEditDialog = (banner: AdBanner) => {
    setEditingBanner(banner);
    setFormData({
      image_url: banner.image_url,
      caption: banner.caption || '',
      shop_id: banner.shop_id || '',
      external_url: banner.external_url || '',
      is_active: banner.is_active,
      sort_order: banner.sort_order,
      autoplay_delay: banner.autoplay_delay,
      display_location: banner.display_location || 'shops',
      country: (banner as any).country || '',
      city: (banner as any).city || '',
    });
    setIsDialogOpen(true);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > MAX_FILE_SIZE) {
      toast.error('Файл слишком большой. Максимум 15 МБ');
      return;
    }

    setIsUploading(true);
    try {
      const compressed = await compressImage(file);
      const fileExt = compressed.blob.type === 'image/webp' ? 'webp' : 'jpg';
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('ad-banners')
        .upload(fileName, compressed.blob);

      if (uploadError) throw uploadError;

      const { data: publicUrl } = supabase.storage
        .from('ad-banners')
        .getPublicUrl(fileName);

      setFormData(prev => ({ ...prev, image_url: publicUrl.publicUrl }));
      toast.success('Изображение загружено');
    } catch (error) {
      console.error('Upload error:', error);
      toast.error('Ошибка загрузки изображения');
    } finally {
      setIsUploading(false);
    }
  };

  const handleSubmit = async () => {
    if (!formData.image_url) {
      toast.error('Загрузите изображение');
      return;
    }

    setIsSubmitting(true);
    try {
      const bannerData = {
        image_url: formData.image_url,
        caption: formData.caption || null,
        shop_id: formData.shop_id || null,
        external_url: formData.shop_id ? null : (formData.external_url || null),
        is_active: formData.is_active,
        sort_order: formData.sort_order,
        autoplay_delay: formData.autoplay_delay,
        display_location: formData.display_location,
        country: formData.country || null,
        city: formData.city || null,
      };

      if (editingBanner) {
        const { error } = await supabase
          .from('ad_banners')
          .update(bannerData)
          .eq('id', editingBanner.id);
        if (error) throw error;
        toast.success('Баннер обновлён');
      } else {
        const { error } = await supabase
          .from('ad_banners')
          .insert(bannerData);
        if (error) throw error;
        toast.success('Баннер добавлен');
      }

      queryClient.invalidateQueries({ queryKey: ['admin-banners'] });
      queryClient.invalidateQueries({ queryKey: ['ad-banners'] });
      setIsDialogOpen(false);
      resetForm();
    } catch (error) {
      console.error('Submit error:', error);
      toast.error('Ошибка сохранения');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (banner: AdBanner) => {
    if (!confirm('Удалить этот баннер?')) return;

    try {
      // Delete image from storage
      const fileName = banner.image_url.split('/').pop();
      if (fileName) {
        await supabase.storage.from('ad-banners').remove([fileName]);
      }

      const { error } = await supabase
        .from('ad_banners')
        .delete()
        .eq('id', banner.id);

      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ['admin-banners'] });
      queryClient.invalidateQueries({ queryKey: ['ad-banners'] });
      toast.success('Баннер удалён');
    } catch (error) {
      console.error('Delete error:', error);
      toast.error('Ошибка удаления');
    }
  };

  const handleToggleActive = async (banner: AdBanner) => {
    try {
      const { error } = await supabase
        .from('ad_banners')
        .update({ is_active: !banner.is_active })
        .eq('id', banner.id);

      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ['admin-banners'] });
      queryClient.invalidateQueries({ queryKey: ['ad-banners'] });
      toast.success(banner.is_active ? 'Баннер скрыт' : 'Баннер активирован');
    } catch (error) {
      console.error('Toggle error:', error);
      toast.error('Ошибка обновления');
    }
  };

  const getShopName = (banner: AdBanner) => {
    if (banner.shop_id) {
      const shop = shops.find(s => s.id === banner.shop_id);
      return shop?.name || 'Неизвестная кофейня';
    }
    if (banner.external_url) {
      return banner.external_url.length > 30 
        ? banner.external_url.substring(0, 30) + '...' 
        : banner.external_url;
    }
    return 'Без ссылки';
  };

  return (
    <AdminLayout title="Рекламные баннеры">
      <div className="p-4 md:p-6">
        <div className="flex flex-col gap-4 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-foreground">Рекламные баннеры</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Рекомендуемый размер: 1200×400px (3:1)
              </p>
            </div>
            <Button onClick={openCreateDialog} className="gap-2">
              <Plus size={16} />
              Добавить
            </Button>
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

        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>
                {editingBanner ? 'Редактировать баннер' : 'Новый баннер'}
              </DialogTitle>
            </DialogHeader>

              <div className="space-y-4 mt-4">
                {/* Image upload */}
                <div>
                  <Label>Изображение *</Label>
                  <div className="mt-2">
                    {formData.image_url ? (
                      <div className="relative">
                        <img
                          src={formData.image_url}
                          alt="Preview"
                          className="w-full h-32 object-cover rounded-lg"
                        />
                        <Button
                          variant="destructive"
                          size="icon"
                          className="absolute top-2 right-2 h-8 w-8"
                          onClick={() => setFormData(prev => ({ ...prev, image_url: '' }))}
                        >
                          <Trash2 size={14} />
                        </Button>
                      </div>
                    ) : (
                      <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-muted rounded-lg cursor-pointer hover:border-primary/50 transition-colors">
                        {isUploading ? (
                          <Loader2 className="w-8 h-8 text-muted-foreground animate-spin" />
                        ) : (
                          <>
                            <Image className="w-8 h-8 text-muted-foreground mb-2" />
                            <span className="text-sm text-muted-foreground">
                              Нажмите для загрузки
                            </span>
                            <span className="text-xs text-muted-foreground mt-1">
                              Макс. 15 МБ
                            </span>
                          </>
                        )}
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={handleImageUpload}
                          disabled={isUploading}
                        />
                      </label>
                    )}
                  </div>
                </div>

                {/* Caption */}
                <div>
                  <Label htmlFor="caption">Подпись (необязательно)</Label>
                  <Input
                    id="caption"
                    value={formData.caption}
                    onChange={(e) => setFormData(prev => ({ ...prev, caption: e.target.value }))}
                    placeholder="Текст под баннером"
                    className="mt-1.5"
                  />
                </div>

                {/* Shop link */}
                <div>
                  <Label>Ссылка на кофейню</Label>
                  <Select
                    value={formData.shop_id}
                    onValueChange={(value) => setFormData(prev => ({ ...prev, shop_id: value === 'none' ? '' : value }))}
                  >
                    <SelectTrigger className="mt-1.5">
                      <SelectValue placeholder="Выберите кофейню" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Без ссылки</SelectItem>
                      {shops.map((shop) => (
                        <SelectItem key={shop.id} value={shop.id}>
                          {shop.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* External URL - only show when no shop selected */}
                {!formData.shop_id && (
                  <div>
                    <Label htmlFor="external_url">Внешняя ссылка</Label>
                    <Input
                      id="external_url"
                      value={formData.external_url}
                      onChange={(e) => setFormData(prev => ({ ...prev, external_url: e.target.value }))}
                      placeholder="https://example.com"
                      className="mt-1.5"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Откроется в новой вкладке
                    </p>
                  </div>
                )}

                {/* Display location */}
                <div>
                  <Label>Место публикации</Label>
                  <Select
                    value={formData.display_location}
                    onValueChange={(value) => setFormData(prev => ({ ...prev, display_location: value }))}
                  >
                    <SelectTrigger className="mt-1.5">
                      <SelectValue placeholder="Выберите место" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="shops">Только в кофейнях</SelectItem>
                      <SelectItem value="home">Только на главной</SelectItem>
                      <SelectItem value="both">На главной и в кофейнях</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Autoplay delay */}
                <div>
                  <Label htmlFor="autoplay_delay">Время прокрутки (сек)</Label>
                  <Input
                    id="autoplay_delay"
                    type="number"
                    min="1"
                    max="30"
                    value={formData.autoplay_delay}
                    onChange={(e) => setFormData(prev => ({ ...prev, autoplay_delay: Math.max(1, Math.min(30, parseInt(e.target.value) || 4)) }))}
                    className="mt-1.5"
                  />
                  <p className="text-xs text-muted-foreground mt-1">От 1 до 30 секунд</p>
                </div>

                {/* Sort order */}
                <div>
                  <Label htmlFor="sort_order">Порядок сортировки</Label>
                  <Input
                    id="sort_order"
                    type="number"
                    min="0"
                    value={formData.sort_order}
                    onChange={(e) => setFormData(prev => ({ ...prev, sort_order: parseInt(e.target.value) || 0 }))}
                    className="mt-1.5"
                  />
                </div>

                {/* Active switch */}
                <div className="flex items-center justify-between">
                  <Label htmlFor="is_active">Активен</Label>
                  <Switch
                    id="is_active"
                    checked={formData.is_active}
                    onCheckedChange={(checked) => setFormData(prev => ({ ...prev, is_active: checked }))}
                  />
                </div>

                {/* Country/City targeting */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Страна</Label>
                    <Select value={formData.country} onValueChange={(v) => setFormData(prev => ({ ...prev, country: v === 'all' ? '' : v, city: '' }))}>
                      <SelectTrigger className="mt-1.5"><SelectValue placeholder="Все страны" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Все страны</SelectItem>
                        {COUNTRY_OPTIONS.map(c => <SelectItem key={c.code} value={c.code}>{c.flag} {c.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Город</Label>
                    <Select value={formData.city} onValueChange={(v) => setFormData(prev => ({ ...prev, city: v === 'all' ? '' : v }))}>
                      <SelectTrigger className="mt-1.5"><SelectValue placeholder="Все города" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Все города</SelectItem>
                        {formData.country && getCitiesForCountry(formData.country).map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <Button
                  onClick={handleSubmit}
                  disabled={isSubmitting || !formData.image_url}
                  className="w-full"
                >
                  {isSubmitting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : editingBanner ? (
                    'Сохранить'
                  ) : (
                    'Добавить'
                  )}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

        {/* Banners list */}
        {bannersLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : banners.length === 0 ? (
          <div className="text-center py-12">
            <Image className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-lg font-medium text-foreground mb-2">Нет баннеров</p>
            <p className="text-sm text-muted-foreground">
              Добавьте первый рекламный баннер
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {banners
              .filter(b => {
                if (listCountryFilter !== 'all' && (b as any).country !== listCountryFilter) return false;
                if (listCityFilter !== 'all' && (b as any).city !== listCityFilter) return false;
                return true;
              })
              .map((banner) => (
              <div
                key={banner.id}
                className={`card-static flex gap-4 ${!banner.is_active ? 'opacity-50' : ''}`}
              >
                <img
                  src={banner.image_url}
                  alt={banner.caption || 'Баннер'}
                  className="w-32 h-20 object-cover rounded-lg shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium text-foreground truncate">
                        {banner.caption || 'Без подписи'}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        → {getShopName(banner)}
                      </p>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                        <span className="flex items-center gap-1">
                          <Eye size={12} />
                          {getStats(banner.id).views}
                        </span>
                        <span className="flex items-center gap-1">
                          <MousePointer size={12} />
                          {getStats(banner.id).clicks}
                        </span>
                        <span>{banner.autoplay_delay} сек</span>
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        📍 {banner.display_location === 'home' ? 'Главная' : banner.display_location === 'shops' ? 'Кофейни' : 'Главная + Кофейни'}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Switch
                        checked={banner.is_active}
                        onCheckedChange={() => handleToggleActive(banner)}
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openEditDialog(banner)}
                      >
                        <Pencil size={16} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(banner)}
                      >
                        <Trash2 size={16} className="text-destructive" />
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
