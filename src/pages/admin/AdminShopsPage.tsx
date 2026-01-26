import { useEffect, useState } from 'react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { Coffee, TrendingUp } from 'lucide-react';

interface ShopStats {
  shop_name: string;
  shop_id: string | null;
  total_redemptions: number;
  coffee_count: number;
  drinks_count: number;
  last_redemption: string | null;
}

export default function AdminShopsPage() {
  const [shops, setShops] = useState<ShopStats[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchShopStats();
  }, []);

  const fetchShopStats = async () => {
    try {
      const { data } = await supabase
        .from('redemptions')
        .select('shop_name, shop_id, drink_type, redeemed_at');

      if (!data) {
        setShops([]);
        return;
      }

      // Group by shop
      const shopMap = new Map<string, ShopStats>();
      
      data.forEach(redemption => {
        const existing = shopMap.get(redemption.shop_name);
        if (existing) {
          existing.total_redemptions++;
          if (redemption.drink_type === 'coffee') {
            existing.coffee_count++;
          } else {
            existing.drinks_count++;
          }
          if (!existing.last_redemption || redemption.redeemed_at > existing.last_redemption) {
            existing.last_redemption = redemption.redeemed_at;
          }
        } else {
          shopMap.set(redemption.shop_name, {
            shop_name: redemption.shop_name,
            shop_id: redemption.shop_id,
            total_redemptions: 1,
            coffee_count: redemption.drink_type === 'coffee' ? 1 : 0,
            drinks_count: redemption.drink_type === 'drinks' ? 1 : 0,
            last_redemption: redemption.redeemed_at,
          });
        }
      });

      const sortedShops = Array.from(shopMap.values())
        .sort((a, b) => b.total_redemptions - a.total_redemptions);

      setShops(sortedShops);
    } catch (error) {
      console.error('Error fetching shop stats:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AdminLayout title="Статистика кофеен">
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <div className="h-24 bg-muted animate-pulse rounded" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : shops.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <p className="text-muted-foreground">Нет данных о кофейнях</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {shops.map((shop, index) => (
            <Card key={shop.shop_name}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <CardTitle className="text-lg">{shop.shop_name}</CardTitle>
                  <div className="flex items-center gap-1 text-sm text-muted-foreground">
                    <TrendingUp className="w-4 h-4" />
                    <span>#{index + 1}</span>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Всего redemptions</span>
                    <span className="font-bold text-xl">{shop.total_redemptions}</span>
                  </div>
                  
                  <div className="flex gap-4">
                    <div className="flex items-center gap-2">
                      <Coffee className="w-4 h-4 text-amber-600" />
                      <span className="text-sm">{shop.coffee_count} кофе</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Coffee className="w-4 h-4 text-purple-600" />
                      <span className="text-sm">{shop.drinks_count} напитков</span>
                    </div>
                  </div>

                  {shop.last_redemption && (
                    <p className="text-xs text-muted-foreground">
                      Последний: {new Date(shop.last_redemption).toLocaleDateString('ru-RU')}
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </AdminLayout>
  );
}
