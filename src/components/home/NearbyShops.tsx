import { ChevronRight, Loader2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { isShopOpen } from '@/utils/shopHours';
import { useState, useEffect, useMemo } from 'react';
import { ShopBadgesList, ShopBadgeData } from '@/components/shop/ShopBadgesList';
import { useShopDistances, Coordinate } from '@/hooks/useShopDistances';
import { formatDistance } from '@/utils/distance';

interface ShopWithCoords {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  working_hours: string | null;
  is_active: boolean;
  logo_url: string | null;
  badge_text: string | null;
  badge_color: string | null;
  badges: unknown;
  coordinates: unknown;
}

function parseCoordinates(coords: unknown): Coordinate[] {
  if (!coords || !Array.isArray(coords)) return [];
  return coords.filter((c): c is Coordinate => c && typeof c.lat === 'number' && typeof c.lng === 'number');
}

// Helper to get all badges from a shop
function getShopBadges(shop: ShopWithCoords): ShopBadgeData[] {
  const badges: ShopBadgeData[] = [];
  
  if (shop.badges && Array.isArray(shop.badges)) {
    (shop.badges as Array<{ text?: string; color?: string }>).forEach(b => {
      if (b && b.text && b.color) {
        badges.push({ text: b.text, color: b.color });
      }
    });
  }
  
  if (badges.length === 0 && shop.badge_text && shop.badge_color) {
    badges.push({ text: shop.badge_text, color: shop.badge_color });
  }
  
  return badges;
}

export function TopShopsByVisits() {
  const [shops, setShops] = useState<ShopWithCoords[]>([]);
  const [visitCounts, setVisitCounts] = useState<Map<string, number>>(new Map());
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchShopsAndVisits();
  }, []);

  const fetchShopsAndVisits = async () => {
    try {
      // Fetch shops and visit counts in parallel
      const [shopsResult, visitsResult] = await Promise.all([
        supabase
          .from('shops')
          .select('*')
          .eq('is_active', true)
          .order('sort_order', { ascending: true }),
        supabase.rpc('get_shop_visit_counts')
      ]);

      if (shopsResult.error) throw shopsResult.error;
      setShops(shopsResult.data || []);

      // Build visit counts map
      if (visitsResult.data) {
        const countsMap = new Map<string, number>();
        visitsResult.data.forEach((item: { shop_id: string; visit_count: number }) => {
          countsMap.set(item.shop_id, item.visit_count);
        });
        setVisitCounts(countsMap);
      }
    } catch (error) {
      console.error('Error fetching shops:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Get distances for display (not for sorting)
  const { distances } = useShopDistances(
    shops.map(s => ({ id: s.id, coordinates: parseCoordinates(s.coordinates) }))
  );

  // Sort by visit count and take top 3
  const topShops = useMemo(() => {
    return [...shops]
      .sort((a, b) => {
        const countA = visitCounts.get(a.id) || 0;
        const countB = visitCounts.get(b.id) || 0;
        return countB - countA;
      })
      .slice(0, 3);
  }, [shops, visitCounts]);

  if (isLoading) {
    return (
      <div className="animate-slide-up" style={{ animationDelay: '0.15s' }}>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-bold text-foreground">Топ по посещениям</h2>
        </div>
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  if (shops.length === 0) {
    return (
      <div className="animate-slide-up" style={{ animationDelay: '0.15s' }}>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-bold text-foreground">Топ по посещениям</h2>
        </div>
        <p className="text-center text-muted-foreground py-4">Нет доступных кофеен</p>
      </div>
    );
  }
  
  return (
    <div className="animate-slide-up" style={{ animationDelay: '0.15s' }}>
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-lg font-bold text-foreground">Топ по посещениям</h2>
        <Link to="/shops" className="text-sm font-semibold text-accent flex items-center gap-1">
          Все
          <ChevronRight size={16} />
        </Link>
      </div>
      
      <div className="space-y-1.5">
        {topShops.map((shop, index) => {
          const isOpen = shop.working_hours ? isShopOpen(shop.working_hours) : false;
          const shopDistance = distances.get(shop.id);
          
          return (
            <Link
              key={shop.id}
              to={`/shops/${shop.id}`}
              className="card-interactive flex items-center gap-3 py-2.5 px-3"
            >
              {/* Rank badge - now based on distance */}
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                index === 0 ? 'bg-accent text-accent-foreground' :
                index === 1 ? 'bg-primary/20 text-primary' :
                'bg-secondary text-muted-foreground'
              }`}>
                {index + 1}
              </div>
              
              {shop.logo_url ? (
                <img src={shop.logo_url} alt={shop.name} className="w-11 h-11 rounded-xl object-cover" />
              ) : (
                <div className="w-11 h-11 rounded-xl bg-secondary flex items-center justify-center text-xl">
                  ☕
                </div>
              )}
              
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold text-foreground text-sm truncate">{shop.name}</p>
                  <span className={`text-xs whitespace-nowrap ${
                    shopDistance?.distance != null ? 'text-foreground font-medium' : 'text-muted-foreground'
                  }`}>
                    {formatDistance(shopDistance?.distance)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-medium ${isOpen ? 'text-accent' : 'text-destructive'}`}>
                    {isOpen ? 'Открыто' : 'Закрыто'}
                  </span>
                </div>
                {/* Badges */}
                {getShopBadges(shop).length > 0 && (
                  <div className="mt-1" onClick={(e) => e.preventDefault()}>
                    <ShopBadgesList badges={getShopBadges(shop)} maxVisible={1} />
                  </div>
                )}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
