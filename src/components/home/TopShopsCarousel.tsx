import { useState, useRef, useEffect, useMemo } from 'react';
import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Skeleton } from '@/components/ui/skeleton';
import { isShopOpen } from '@/utils/shopHours';
import { useShopDistances, Coordinate } from '@/hooks/useShopDistances';
import { formatDistance, sortByDistance } from '@/utils/distance';
import { queryKeys, prefetchShops } from '@/hooks/usePrefetch';
import { useLanguage } from '@/contexts/LanguageContext';
import { useUserStatsContext } from '@/contexts/UserStatsContext';

interface Shop {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  working_hours: string | null;
  is_active: boolean;
  logo_url: string | null;
  gallery_urls: string[] | null;
  coordinates: unknown;
}

function parseCoordinates(coords: unknown): Coordinate[] {
  if (!coords || !Array.isArray(coords)) return [];
  return coords.filter((c): c is Coordinate => c && typeof c.lat === 'number' && typeof c.lng === 'number');
}

export function TopShopsCarousel() {
  const [activeIndex, setActiveIndex] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { t } = useLanguage();
  const { profile } = useUserStatsContext();
  const userCountry = profile?.country || 'KZ';
  const userCity = profile?.city || null;

  const { data: shops = [], isLoading } = useQuery({
    queryKey: queryKeys.shops,
    queryFn: prefetchShops,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    const handleScroll = () => {
      const scrollLeft = container.scrollLeft;
      const itemWidth = 128 + 10;
      const newIndex = Math.round(scrollLeft / itemWidth);
      setActiveIndex(Math.min(newIndex, shops.length - 1));
    };
    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, [shops.length]);

  const shopCoordinates = useMemo(() => 
    shops.map(s => ({ id: s.id, coordinates: parseCoordinates(s.coordinates) })),
    [shops]
  );
  const { distances, userLocation } = useShopDistances(shopCoordinates);
  const sortedShops = useMemo(() => {
    const filtered = shops.filter(s => {
      if (s.country && s.country !== userCountry) return false;
      if (userCity && s.city && s.city !== userCity) return false;
      return true;
    });
    const openShops = filtered.filter(s => s.working_hours ? isShopOpen(s.working_hours) : false);
    const shopsToSort = openShops.length > 0 ? openShops : filtered;
    const sorted = userLocation && distances.size > 0
      ? sortByDistance(shopsToSort, distances)
      : shopsToSort;
    return sorted.slice(0, 4);
  }, [shops, distances, userLocation, userCountry, userCity]);

  if (isLoading) {
    return (
      <div className="animate-slide-up">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold text-foreground">{t('home.nearbyShops')}</h2>
          <Link to="/shops" className="text-sm font-semibold text-accent flex items-center gap-1">
            {t('home.all')}
            <ChevronRight size={16} />
          </Link>
        </div>
        <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide -mx-4 px-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="flex-shrink-0 flex flex-col items-center w-20">
              <Skeleton className="w-16 h-16 rounded-full mb-1.5" />
              <Skeleton className="h-3 w-14" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (shops.length === 0) return null;

  return (
    <div className="animate-slide-up">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-bold text-foreground">{t('home.nearbyShops')}</h2>
        <Link to="/shops" className="text-sm font-semibold text-accent flex items-center gap-1">
          {t('home.all')}
          <ChevronRight size={16} />
        </Link>
      </div>
      
      <div 
        ref={scrollRef}
        className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide -mx-4 px-4 snap-x snap-mandatory justify-center"
      >
        {sortedShops.map((shop) => {
          const isOpen = shop.working_hours ? isShopOpen(shop.working_hours) : false;
          const shopDistance = distances.get(shop.id);
          
          return (
            <Link
              key={shop.id}
              to={`/shops/${shop.id}`}
              className="flex-shrink-0 flex flex-col items-center w-20 snap-start group"
            >
              <div className="relative w-16 h-16 mb-1.5">
                <div className="w-full h-full rounded-full overflow-hidden bg-secondary shadow-md ring-2 ring-accent/20">
                  {(shop.gallery_urls?.[0] || shop.logo_url) ? (
                    <img
                      src={shop.gallery_urls?.[0] || shop.logo_url!}
                      alt={shop.name}
                      loading="lazy"
                      className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-xl bg-gradient-to-br from-secondary to-muted">
                      ☕
                    </div>
                  )}
                </div>
                <div className={`absolute bottom-0 right-0 w-4 h-4 rounded-full border-2 border-background ${
                  isOpen ? 'bg-accent' : 'bg-destructive'
                }`} />
              </div>
              
              <h3 className="font-medium text-foreground text-xs text-center truncate w-full px-1">{shop.name}</h3>
              <span className="text-[10px] text-muted-foreground">
                {formatDistance(shopDistance?.distance)}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
