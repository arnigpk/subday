import { useState, useMemo, memo, useCallback } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { useQuery } from '@tanstack/react-query';
import { Clock, MapPinOff, Navigation, Loader2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { isShopOpen } from '@/utils/shopHours';
import { AddressesList } from '@/components/shop/AddressesList';
import { ShopBadgesList, ShopBadgeData } from '@/components/shop/ShopBadgesList';
import { useShopDistances, Coordinate } from '@/hooks/useShopDistances';
import { formatDistance, sortByDistance } from '@/utils/distance';
import { queryKeys, prefetchShops } from '@/hooks/usePrefetch';
import { AdBannerCarousel } from '@/components/shop/AdBannerCarousel';

interface Shop {
  id: string;
  name: string;
  address: string | null;
  addresses: string[] | null;
  city: string | null;
  working_hours: string | null;
  is_active: boolean;
  logo_url: string | null;
  gallery_urls: string[] | null;
  badge_text: string | null;
  badge_color: string | null;
  badges: unknown;
  coordinates: unknown;
}

const filters = [
  { id: 'all', label: 'Все' },
  { id: 'open', label: 'Открыто' },
  { id: 'specialty', label: 'Specialty' },
];

const ShopStatusBadge = memo(function ShopStatusBadge({ openHours }: { openHours: string }) {
  const isOpen = isShopOpen(openHours);
  
  return (
    <div className="flex items-center gap-1">
      <Clock size={12} className={isOpen ? 'text-accent' : 'text-destructive'} />
      <span className={`text-xs font-medium ${isOpen ? 'text-accent' : 'text-destructive'}`}>
        {isOpen ? 'Открыто' : 'Закрыто'}
      </span>
    </div>
  );
});

function getShopBadges(shop: Shop): ShopBadgeData[] {
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

function hasSpecialtyBadge(shop: Shop): boolean {
  const badges = getShopBadges(shop);
  return badges.some(b => b.text.toLowerCase() === 'specialty');
}

function parseCoordinates(coords: unknown): Coordinate[] {
  if (!coords || !Array.isArray(coords)) return [];
  return coords.filter((c): c is Coordinate => c && typeof c.lat === 'number' && typeof c.lng === 'number');
}

interface ShopCardProps {
  shop: Shop & { isCurrentlyOpen: boolean; allBadges: ShopBadgeData[]; isSpecialty: boolean };
  distance: { distance: number | null; closestAddressIndex: number } | undefined;
  index: number;
}

const ShopCard = memo(function ShopCard({ shop, distance, index }: ShopCardProps) {
  const closestIndex = distance?.closestAddressIndex ?? 0;
  const addresses = shop.addresses || (shop.address ? [shop.address] : []);
  
  // Reorder addresses to show closest first
  const reorderedAddresses = addresses.length > 1 && closestIndex > 0
    ? [addresses[closestIndex], ...addresses.filter((_, i) => i !== closestIndex)]
    : addresses;
  
  const handleAddressClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
  }, []);
  
  return (
    <div
      className="block animate-slide-up"
      style={{ animationDelay: `${index * 0.03}s` }}
    >
      <Link
        to={`/shops/${shop.id}`}
        className="card-interactive block"
      >
        <div className="flex items-start gap-3">
          {(shop.gallery_urls?.[0] || shop.logo_url) ? (
            <img 
              src={shop.gallery_urls?.[0] || shop.logo_url!} 
              alt={shop.name} 
              className="w-16 h-16 rounded-xl object-cover shrink-0"
              loading="lazy"
            />
          ) : (
            <div className="w-16 h-16 rounded-xl bg-secondary flex items-center justify-center text-2xl shrink-0">
              ☕
            </div>
          )}
          
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-bold text-foreground truncate">{shop.name}</h3>
              <span className={`text-xs whitespace-nowrap ${
                distance?.distance != null ? 'text-foreground font-medium' : 'text-muted-foreground'
              }`}>
                {formatDistance(distance?.distance)}
              </span>
            </div>
            
            {/* Addresses - closest first */}
            <div onClick={handleAddressClick}>
              <AddressesList 
                addresses={reorderedAddresses} 
                variant="compact"
                className="mt-2"
              />
            </div>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              {shop.city && (
                <div className="flex items-center gap-1">
                  <Navigation size={12} className="text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">{shop.city}</span>
                </div>
              )}
              {shop.working_hours && (
                <ShopStatusBadge openHours={shop.working_hours} />
              )}
              {shop.allBadges.length > 0 && (
                <div onClick={handleAddressClick}>
                  <ShopBadgesList badges={shop.allBadges} maxVisible={1} />
                </div>
              )}
            </div>
          </div>
        </div>
      </Link>
    </div>
  );
});

export default function ShopsPage() {
  const [activeFilter, setActiveFilter] = useState('all');

  const { data: shops = [], isLoading } = useQuery({
    queryKey: queryKeys.shops,
    queryFn: prefetchShops,
    staleTime: 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  // Memoize shop coordinates
  const shopCoordinates = useMemo(() => 
    shops.map(s => ({ id: s.id, coordinates: parseCoordinates(s.coordinates) })),
    [shops]
  );

  // Get distances for all shops
  const { distances, permissionDenied, userLocation } = useShopDistances(shopCoordinates);

  // Process shops with status and badges
  const shopsWithStatus = useMemo(() => {
    return shops.map(shop => ({
      ...shop,
      isCurrentlyOpen: shop.working_hours ? isShopOpen(shop.working_hours) : false,
      allBadges: getShopBadges(shop),
      isSpecialty: hasSpecialtyBadge(shop),
    }));
  }, [shops]);
  
  // Filter and sort shops
  const filteredAndSortedShops = useMemo(() => {
    let filtered = shopsWithStatus.filter(shop => {
      if (activeFilter === 'open' && !shop.isCurrentlyOpen) return false;
      if (activeFilter === 'specialty' && !shop.isSpecialty) return false;
      return true;
    });

    // Sort by distance if user location is available
    if (userLocation && distances.size > 0) {
      filtered = sortByDistance(filtered, distances);
    }

    return filtered;
  }, [shopsWithStatus, activeFilter, distances, userLocation]);
  
  const handleFilterClick = useCallback((filterId: string) => {
    setActiveFilter(filterId);
  }, []);
  
  return (
    <AppLayout>
      <div className="safe-area-top">
        <div className="px-4 py-4">
          <h1 className="text-2xl font-black text-foreground mb-4">Кофейни</h1>
          
          {/* Ad Banner Carousel */}
          <AdBannerCarousel />

          {/* Location status */}
          {permissionDenied && (
            <div className="flex items-center gap-2 px-3 py-2 bg-muted/50 rounded-xl mb-4 text-sm text-muted-foreground">
              <MapPinOff size={16} />
              <span>Включите геолокацию для сортировки по расстоянию</span>
            </div>
          )}
          
          {/* Filters */}
          <div className="flex gap-2 overflow-x-auto pb-2 mb-4 scrollbar-hide">
            {filters.map((filter) => (
              <button
                key={filter.id}
                onClick={() => handleFilterClick(filter.id)}
                className={`px-4 py-2 rounded-xl text-sm font-semibold whitespace-nowrap transition-all ${
                  activeFilter === filter.id
                    ? 'bg-accent text-accent-foreground'
                    : 'bg-secondary text-secondary-foreground'
                }`}
              >
                {filter.label}
              </button>
            ))}
          </div>
          
          {/* Shops list */}
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : filteredAndSortedShops.length > 0 ? (
            <div className="space-y-3">
              {filteredAndSortedShops.map((shop, index) => (
                <ShopCard
                  key={shop.id}
                  shop={shop}
                  distance={distances.get(shop.id)}
                  index={index}
                />
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <div className="text-4xl mb-4">🔍</div>
              <p className="text-lg font-semibold text-foreground mb-2">Нет кофеен</p>
              <p className="text-sm text-muted-foreground">Попробуйте изменить фильтр</p>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
