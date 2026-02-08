import { useMemo, memo, useCallback } from 'react';
import { ChevronRight, Loader2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { isShopOpen } from '@/utils/shopHours';
import { ShopBadgesList, ShopBadgeData } from '@/components/shop/ShopBadgesList';
import { queryKeys, prefetchShops } from '@/hooks/usePrefetch';

interface ShopData {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  working_hours: string | null;
  is_active: boolean;
  logo_url: string | null;
  gallery_urls: string[] | null;
  badge_text: string | null;
  badge_color: string | null;
  badges: unknown;
}

function getShopBadges(shop: ShopData): ShopBadgeData[] {
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

const fetchVisitCounts = async (): Promise<Map<string, number>> => {
  const { data } = await supabase.rpc('get_shop_visit_counts');
  const countsMap = new Map<string, number>();
  if (data) {
    data.forEach((item: { shop_id: string; visit_count: number }) => {
      countsMap.set(item.shop_id, item.visit_count);
    });
  }
  return countsMap;
};

interface ShopCardProps {
  shop: ShopData;
  index: number;
}

const ShopCard = memo(function ShopCard({ shop, index }: ShopCardProps) {
  const isOpen = shop.working_hours ? isShopOpen(shop.working_hours) : false;
  const badges = useMemo(() => getShopBadges(shop), [shop]);
  
  const handleBadgeClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
  }, []);
  
  return (
    <Link
      to={`/shops/${shop.id}`}
      className="card-interactive flex items-center gap-3 py-2.5 px-3"
    >
      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
        index === 0 ? 'bg-accent text-accent-foreground' :
        index === 1 ? 'bg-primary/20 text-primary' :
        'bg-secondary text-muted-foreground'
      }`}>
        {index + 1}
      </div>
      
      {(shop.gallery_urls?.[0] || shop.logo_url) ? (
        <img 
          src={shop.gallery_urls?.[0] || shop.logo_url!} 
          alt={shop.name} 
          className="w-11 h-11 rounded-xl object-cover"
          loading="lazy"
        />
      ) : (
        <div className="w-11 h-11 rounded-xl bg-secondary flex items-center justify-center text-xl">
          ☕
        </div>
      )}
      
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-foreground text-sm truncate">{shop.name}</p>
        <div className="flex items-center gap-2">
          <span className={`text-xs font-medium ${isOpen ? 'text-accent' : 'text-destructive'}`}>
            {isOpen ? 'Открыто' : 'Закрыто'}
          </span>
        </div>
        {badges.length > 0 && (
          <div className="mt-1" onClick={handleBadgeClick}>
            <ShopBadgesList badges={badges} maxVisible={1} />
          </div>
        )}
      </div>
    </Link>
  );
});

export const TopShopsByVisits = memo(function TopShopsByVisits() {
  const { data: shops = [], isLoading: shopsLoading } = useQuery({
    queryKey: queryKeys.shops,
    queryFn: prefetchShops,
    staleTime: 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  const { data: visitCounts = new Map(), isLoading: visitsLoading } = useQuery({
    queryKey: queryKeys.shopVisits,
    queryFn: fetchVisitCounts,
    staleTime: 2 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  const isLoading = shopsLoading || visitsLoading;

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
        {topShops.map((shop, index) => (
          <ShopCard key={shop.id} shop={shop} index={index} />
        ))}
      </div>
    </div>
  );
});
