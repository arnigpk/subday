import { useMemo } from 'react';
import { ChevronRight, Loader2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { isShopOpen } from '@/utils/shopHours';
import { ShopBadgesList, ShopBadgeData } from '@/components/shop/ShopBadgesList';
import { queryKeys, prefetchShops } from '@/hooks/usePrefetch';
import { useLanguage } from '@/contexts/LanguageContext';
import { useUserStatsContext } from '@/contexts/UserStatsContext';

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
      if (b && b.text && b.color) badges.push({ text: b.text, color: b.color });
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

export function TopShopsByVisits() {
  const { t } = useLanguage();
  const { profile } = useUserStatsContext();
  const userCountry = profile?.country || 'KZ';
  const userCity = profile?.city || null;

  const { data: shops = [], isLoading: shopsLoading } = useQuery({
    queryKey: queryKeys.shops,
    queryFn: prefetchShops,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });

  const { data: visitCounts = new Map(), isLoading: visitsLoading } = useQuery({
    queryKey: ['visitCounts'],
    queryFn: fetchVisitCounts,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });

  const isLoading = shopsLoading || visitsLoading;

  const topShops = useMemo(() => {
    return [...shops]
      .filter(s => {
        if (s.country && s.country !== userCountry) return false;
        if (userCity && s.city && s.city !== userCity) return false;
        return true;
      })
      .sort((a, b) => {
        const countA = visitCounts.get(a.id) || 0;
        const countB = visitCounts.get(b.id) || 0;
        return countB - countA;
      })
      .slice(0, 3);
  }, [shops, visitCounts, userCountry, userCity]);

  if (isLoading) {
    return (
      <div className="animate-slide-up" style={{ animationDelay: '0.15s' }}>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-bold text-foreground">{t('home.topByVisits')}</h2>
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
          <h2 className="text-lg font-bold text-foreground">{t('home.topByVisits')}</h2>
        </div>
        <p className="text-center text-muted-foreground py-4">{t('shops.noShops')}</p>
      </div>
    );
  }
  
  return (
    <div className="animate-slide-up" style={{ animationDelay: '0.15s' }}>
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-lg font-bold text-foreground">{t('home.topByVisits')}</h2>
        <Link to="/shops" className="text-sm font-semibold text-accent flex items-center gap-1">
          {t('home.all')}
          <ChevronRight size={16} />
        </Link>
      </div>
      
      <div className="space-y-1.5">
        {topShops.map((shop, index) => {
          const isOpen = shop.working_hours ? isShopOpen(shop.working_hours) : false;
          
          return (
            <Link key={shop.id} to={`/shops/${shop.id}`} className="card-interactive flex items-center gap-3 py-2.5 px-3">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                index === 0 ? 'bg-accent text-accent-foreground' :
                index === 1 ? 'bg-primary/20 text-primary' :
                'bg-secondary text-muted-foreground'
              }`}>
                {index + 1}
              </div>
              
              {(shop.gallery_urls?.[0] || shop.logo_url) ? (
                <img src={shop.gallery_urls?.[0] || shop.logo_url!} alt={shop.name} className="w-11 h-11 rounded-xl object-cover" />
              ) : (
                <div className="w-11 h-11 rounded-xl bg-secondary flex items-center justify-center text-xl">☕</div>
              )}
              
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-foreground text-sm truncate">{shop.name}</p>
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-medium ${isOpen ? 'text-green-700 dark:text-green-500' : 'text-destructive'}`}>
                    {isOpen ? t('shops.open') : t('shops.closed')}
                  </span>
                </div>
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
