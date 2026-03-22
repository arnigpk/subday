import { useState, useEffect } from 'react';
import { PartnerLayout } from '@/components/partner/PartnerLayout';
import { usePartnerAuth } from '@/hooks/usePartnerAuth';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ArrowTrendingUpIcon, ClockIcon, StarIcon, BuildingStorefrontIcon, CheckIcon, XMarkIcon, PencilIcon } from '@heroicons/react/24/outline';
import { Coffee, Loader2 } from 'lucide-react';;
import { Textarea } from '@/components/ui/textarea';
import { format, startOfDay, subDays } from 'date-fns';
import { ru } from 'date-fns/locale';
import { toast } from 'sonner';
import { ShopLogoUpload } from '@/components/admin/ShopLogoUpload';
import { SimpleAddressesEditor } from '@/components/shop/SimpleAddressesEditor';

interface Stats {
  today: number;
  week: number;
  popularDrink: string | null;
  peakHour: string | null;
}

interface ShopData {
  name: string;
  address: string;
  addresses: string[];
  working_hours: string;
  logo_url: string | null;
  description: string;
}

export default function PartnerDashboard() {
  const { shopId, isLoading: authLoading } = usePartnerAuth();
  const [stats, setStats] = useState<Stats>({
    today: 0,
    week: 0,
    popularDrink: null,
    peakHour: null,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [shopData, setShopData] = useState<ShopData | null>(null);
  const [editedShopData, setEditedShopData] = useState<ShopData | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!shopId || authLoading) return;

    const fetchData = async () => {
      try {
        const today = startOfDay(new Date()).toISOString();
        const weekAgo = subDays(new Date(), 7).toISOString();

        // Fetch shop data
        const { data: shop } = await supabase
          .from('shops')
          .select('name, address, addresses, working_hours, logo_url, description')
          .eq('id', shopId)
          .maybeSingle();

        if (shop) {
          const addressesArray = shop.addresses || (shop.address ? [shop.address] : []);
          setShopData({
            name: shop.name,
            address: shop.address || '',
            addresses: addressesArray,
            working_hours: shop.working_hours || '09:00-21:00',
            logo_url: shop.logo_url || null,
            description: (shop as any).description || '',
          });
        }

        // Fetch today's redemptions
        const { count: todayCount } = await supabase
          .from('redemptions')
          .select('*', { count: 'exact', head: true })
          .eq('shop_id', shopId)
          .gte('redeemed_at', today);

        // Fetch week's redemptions
        const { count: weekCount } = await supabase
          .from('redemptions')
          .select('*', { count: 'exact', head: true })
          .eq('shop_id', shopId)
          .gte('redeemed_at', weekAgo);

        // Fetch popular drink (last 30 days)
        const { data: drinks } = await supabase
          .from('redemptions')
          .select('drink_name')
          .eq('shop_id', shopId)
          .gte('redeemed_at', subDays(new Date(), 30).toISOString());

        let popularDrink: string | null = null;
        if (drinks && drinks.length > 0) {
          const drinkCounts: Record<string, number> = {};
          drinks.forEach(d => {
            drinkCounts[d.drink_name] = (drinkCounts[d.drink_name] || 0) + 1;
          });
          const sorted = Object.entries(drinkCounts).sort((a, b) => b[1] - a[1]);
          popularDrink = sorted[0]?.[0] || null;
        }

        // Fetch peak hour (last 7 days)
        const { data: hourlyData } = await supabase
          .from('redemptions')
          .select('redeemed_at')
          .eq('shop_id', shopId)
          .gte('redeemed_at', weekAgo);

        let peakHour: string | null = null;
        if (hourlyData && hourlyData.length > 0) {
          const hourCounts: Record<number, number> = {};
          hourlyData.forEach(r => {
            const hour = new Date(r.redeemed_at).getHours();
            hourCounts[hour] = (hourCounts[hour] || 0) + 1;
          });
          const sorted = Object.entries(hourCounts).sort((a, b) => b[1] - a[1]);
          const peak = sorted[0]?.[0];
          if (peak !== undefined) {
            peakHour = `${peak}:00 - ${parseInt(peak) + 1}:00`;
          }
        }

        setStats({
          today: todayCount || 0,
          week: weekCount || 0,
          popularDrink,
          peakHour,
        });
      } catch (error) {
        console.error('Error fetching data:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [shopId, authLoading]);

  const handleEditStart = () => {
    setEditedShopData(shopData);
    setIsEditing(true);
  };

  const handleEditCancel = () => {
    setEditedShopData(null);
    setIsEditing(false);
  };

  const handleSave = async () => {
    if (!shopId || !editedShopData) return;

    // Validate working hours format
    const hoursRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]-([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
    if (!hoursRegex.test(editedShopData.working_hours)) {
      toast.error('Неверный формат времени работы. Используйте формат ЧЧ:ММ-ЧЧ:ММ');
      return;
    }

    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('shops')
        .update({
          name: editedShopData.name.trim(),
          address: editedShopData.addresses[0]?.trim() || null,
          addresses: editedShopData.addresses.map(a => a.trim()).filter(Boolean),
          working_hours: editedShopData.working_hours.trim(),
          logo_url: editedShopData.logo_url,
          description: editedShopData.description.trim() || null,
        })
        .eq('id', shopId);

      if (error) throw error;

      setShopData(editedShopData);
      setIsEditing(false);
      toast.success('Данные кофейни обновлены');
    } catch (error) {
      console.error('Error updating shop:', error);
      toast.error('Ошибка при сохранении');
    } finally {
      setIsSaving(false);
    }
  };

  if (authLoading || isLoading) {
    return (
      <PartnerLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </PartnerLayout>
    );
  }

  return (
    <PartnerLayout>
      <div className="p-4 space-y-4">
        <h2 className="text-xl font-bold text-foreground">Статистика</h2>

        <div className="grid grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Coffee size={16} />
                Сегодня
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-foreground">{stats.today}</p>
              <p className="text-xs text-muted-foreground">списаний</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <ArrowTrendingUpIcon className="w-4 h-4" />
                За неделю
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-foreground">{stats.week}</p>
              <p className="text-xs text-muted-foreground">списаний</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <StarIcon className="w-4 h-4" />
                Популярный напиток
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-lg font-bold text-foreground">
                {stats.popularDrink || '—'}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <ClockIcon className="w-4 h-4" />
                Пиковое время
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-lg font-bold text-foreground">
                {stats.peakHour || '—'}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Shop Settings */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <BuildingStorefrontIcon className="w-[18px] h-[18px]" />
              Моя кофейня
            </CardTitle>
            {!isEditing && (
              <Button variant="ghost" size="sm" onClick={handleEditStart}>
                <PencilIcon className="w-4 h-4" className="mr-1" />
                Изменить
              </Button>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            {isEditing && editedShopData ? (
              <>
                <ShopLogoUpload
                  currentLogoUrl={editedShopData.logo_url}
                  onLogoChange={(url) => setEditedShopData({ ...editedShopData, logo_url: url })}
                  shopId={shopId || undefined}
                  label="Фото"
                  maxSizeMb={10}
                />
                <div className="space-y-2">
                  <Label htmlFor="shop-name">Название</Label>
                  <Input
                    id="shop-name"
                    value={editedShopData.name}
                    onChange={(e) => setEditedShopData({ ...editedShopData, name: e.target.value })}
                    placeholder="Название кофейни"
                  />
                </div>
                <div className="space-y-2">
                  <SimpleAddressesEditor
                    addresses={editedShopData.addresses}
                    onChange={(addresses) => setEditedShopData({ ...editedShopData, addresses, address: addresses[0] || '' })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="shop-description">О кофейне</Label>
                  <Textarea
                    id="shop-description"
                    value={editedShopData.description}
                    onChange={(e) => setEditedShopData({ ...editedShopData, description: e.target.value })}
                    placeholder="Расскажите о вашей кофейне..."
                    rows={3}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="shop-hours">Время работы</Label>
                  <Input
                    id="shop-hours"
                    value={editedShopData.working_hours}
                    onChange={(e) => setEditedShopData({ ...editedShopData, working_hours: e.target.value })}
                    placeholder="09:00-21:00"
                  />
                  <p className="text-xs text-muted-foreground">Формат: ЧЧ:ММ-ЧЧ:ММ</p>
                </div>
                <div className="flex gap-2">
                  <Button onClick={handleSave} disabled={isSaving} className="flex-1">
                    {isSaving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <CheckIcon className="w-4 h-4" className="mr-1" />}
                    Сохранить
                  </Button>
                  <Button variant="outline" onClick={handleEditCancel} disabled={isSaving}>
                    <XMarkIcon className="w-4 h-4" />
                  </Button>
                </div>
              </>
            ) : (
              shopData && (
                <div className="space-y-3">
                  {shopData.logo_url && (
                    <div>
                      <p className="text-sm text-muted-foreground mb-1">Фото</p>
                      <img
                        src={shopData.logo_url}
                        alt={shopData.name}
                        className="w-16 h-16 rounded-lg object-cover border"
                      />
                    </div>
                  )}
                  <div>
                    <p className="text-sm text-muted-foreground">Название</p>
                    <p className="font-medium">{shopData.name}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Адреса</p>
                    {shopData.addresses.length > 0 ? (
                      <div className="space-y-1">
                        {shopData.addresses.map((addr, index) => (
                          <p key={index} className="font-medium">{addr}</p>
                        ))}
                      </div>
                    ) : (
                      <p className="font-medium">{shopData.address || '—'}</p>
                    )}
                  </div>
                  {shopData.description && (
                    <div>
                      <p className="text-sm text-muted-foreground">О кофейне</p>
                      <p className="font-medium text-sm whitespace-pre-line">{shopData.description}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-sm text-muted-foreground">Время работы</p>
                    <p className="font-medium">{shopData.working_hours}</p>
                  </div>
                </div>
              )
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Сегодня</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              {format(new Date(), "d MMMM yyyy, EEEE", { locale: ru })}
            </p>
          </CardContent>
        </Card>
      </div>
    </PartnerLayout>
  );
}
