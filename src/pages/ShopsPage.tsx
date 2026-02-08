import { useState, useMemo } from 'react';
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

function ShopStatusBadge({ openHours }: { openHours: string }) {
  const isOpen = isShopOpen(openHours);
  
  return (
    <div className="flex items-center gap-1">
      <Clock size={12} className={isOpen ? 'text-accent' : 'text-destructive'} />
      <span className={`text-xs font-medium ${isOpen ? 'text-accent' : 'text-destructive'}`}>
        {isOpen ? 'Открыто' : 'Закрыто'}
      </span>
    </div>
  );
}

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

export default function ShopsPage() {
  const [activeFilter, setActiveFilter] = useState('all');

  const { data: shops = [], isLoading } = useQuery({
    queryKey: queryKeys.shops,
    queryFn: prefetchShops,
    staleTime: 30 * 1000, // 30 seconds
    gcTime: 5 * 60 * 1000, // 5 minutes cache
  });

  // Memoize shop coordinates to prevent infinite re-renders in useShopDistances
  const shopCoordinates = useMemo(() => 
    shops.map(s => ({ id: s.id, coordinates: parseCoordinates(s.coordinates) })),
    [shops]
  );

  // Get distances for all shops
  const { distances, loading: distancesLoading, permissionDenied, userLocation } = useShopDistances(shopCoordinates);

  // Add real-time open status to shops
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
                onClick={() => setActiveFilter(filter.id)}
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
              {filteredAndSortedShops.map((shop, index) => {
                const shopDistance = distances.get(shop.id);
                const closestIndex = shopDistance?.closestAddressIndex ?? 0;
                const addresses = shop.addresses || (shop.address ? [shop.address] : []);
                
                // Reorder addresses to show closest first
                const reorderedAddresses = addresses.length > 1 && closestIndex > 0
                  ? [addresses[closestIndex], ...addresses.filter((_, i) => i !== closestIndex)]
                  : addresses;
                
                return (
                  <div
                    key={shop.id}
                    className="block animate-slide-up"
                    style={{ animationDelay: `${index * 0.05}s` }}
                  >
                    <Link
                      to={`/shops/${shop.id}`}
                      className="card-interactive block"
                    >
                      <div className="flex items-start gap-3">
                        {(shop.gallery_urls?.[0] || shop.logo_url) ? (
                          <img src={shop.gallery_urls?.[0] || shop.logo_url!} alt={shop.name} className="w-16 h-16 rounded-xl object-cover shrink-0" />
                        ) : (
                          <div className="w-16 h-16 rounded-xl bg-secondary flex items-center justify-center text-2xl shrink-0">
                            ☕
                          </div>
                        )}
                        
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <h3 className="font-bold text-foreground truncate">{shop.name}</h3>
                            <span className={`text-xs whitespace-nowrap ${
                              shopDistance?.distance != null ? 'text-foreground font-medium' : 'text-muted-foreground'
                            }`}>
                              {formatDistance(shopDistance?.distance)}
                            </span>
                          </div>
                          
                          {/* Addresses - closest first */}
                          <div onClick={(e) => e.preventDefault()}>
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
                              <div onClick={(e) => e.preventDefault()}>
                                <ShopBadgesList badges={shop.allBadges} maxVisible={1} />
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </Link>
                  </div>
                );
              })}
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
