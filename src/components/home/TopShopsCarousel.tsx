import { useState, useEffect, useRef, useMemo, memo } from 'react';
import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Skeleton } from '@/components/ui/skeleton';
import { isShopOpen } from '@/utils/shopHours';
import { useShopDistances, Coordinate } from '@/hooks/useShopDistances';
import { formatDistance, sortByDistance } from '@/utils/distance';
import { queryKeys, prefetchShops } from '@/hooks/usePrefetch';

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

interface ShopItemProps {
  shop: Shop;
  isOpen: boolean;
  distance: number | null | undefined;
}

const ShopItem = memo(function ShopItem({ shop, isOpen, distance }: ShopItemProps) {
  return (
    <Link
      to={`/shops/${shop.id}`}
      className="flex-shrink-0 flex flex-col items-center w-20 snap-start group"
    >
      <div className="relative w-16 h-16 mb-1.5">
        <div className="w-full h-full rounded-full overflow-hidden bg-secondary shadow-md ring-2 ring-accent/20">
          {(shop.gallery_urls?.[0] || shop.logo_url) ? (
            <img
              src={shop.gallery_urls?.[0] || shop.logo_url!}
              alt={shop.name}
              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
              loading="lazy"
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
        {formatDistance(distance)}
      </span>
    </Link>
  );
});

const CarouselSkeleton = memo(function CarouselSkeleton() {
  return (
    <div className="animate-slide-up">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-bold text-foreground">Кофейни рядом</h2>
        <Link to="/shops" className="text-sm font-semibold text-accent flex items-center gap-1">
          Все
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
});

export const TopShopsCarousel = memo(function TopShopsCarousel() {
  const [activeIndex, setActiveIndex] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data: shops = [], isLoading } = useQuery({
    queryKey: queryKeys.shops,
    queryFn: prefetchShops,
    staleTime: 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  // Handle scroll to update active indicator
  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;

    const handleScroll = () => {
      const scrollLeft = container.scrollLeft;
      const itemWidth = 128 + 10;
      const newIndex = Math.round(scrollLeft / itemWidth);
      setActiveIndex(Math.min(newIndex, shops.length - 1));
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, [shops.length]);

  // Memoize shop coordinates
  const shopCoordinates = useMemo(() => 
    shops.map(s => ({ id: s.id, coordinates: parseCoordinates(s.coordinates) })),
    [shops]
  );

  // Get distances for all shops
  const { distances, userLocation } = useShopDistances(shopCoordinates);

  // Sort shops by distance if location available
  const sortedShops = useMemo(() => {
    if (userLocation && distances.size > 0) {
      return sortByDistance(shops, distances);
    }
    return shops;
  }, [shops, distances, userLocation]);

  if (isLoading) {
    return <CarouselSkeleton />;
  }

  if (shops.length === 0) {
    return null;
  }

  return (
    <div className="animate-slide-up">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-bold text-foreground">Кофейни рядом</h2>
        <Link to="/shops" className="text-sm font-semibold text-accent flex items-center gap-1">
          Все
          <ChevronRight size={16} />
        </Link>
      </div>
      
      <div 
        ref={scrollRef}
        className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide -mx-4 px-4 snap-x snap-mandatory"
      >
        {sortedShops.map((shop) => (
          <ShopItem
            key={shop.id}
            shop={shop}
            isOpen={shop.working_hours ? isShopOpen(shop.working_hours) : false}
            distance={distances.get(shop.id)?.distance}
          />
        ))}
      </div>
      
      {/* Dots */}
      {sortedShops.length > 3 && (
        <div className="flex justify-center gap-1.5 mt-2">
          {sortedShops.map((_, i) => (
            <div
              key={i}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i === activeIndex 
                  ? 'w-4 bg-accent' 
                  : 'w-1.5 bg-muted-foreground/30'
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
});
