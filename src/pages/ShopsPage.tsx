import { useState, useMemo, useCallback } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { PullToRefresh } from '@/components/layout/PullToRefresh';
import { LiquidGlassHeader } from '@/components/layout/LiquidGlassHeader';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ClockIcon } from '@heroicons/react/24/outline';
import { MapPinOff, Navigation, Loader2 } from 'lucide-react';;
import { Link } from 'react-router-dom';
import { isShopOpen, isAnyAddressOpen } from '@/utils/shopHours';
import { AddressesList } from '@/components/shop/AddressesList';
import { ShopBadgesList, ShopBadgeData } from '@/components/shop/ShopBadgesList';
import { useShopDistances, Coordinate } from '@/hooks/useShopDistances';
import { formatDistance, sortByDistance } from '@/utils/distance';
import { queryKeys, prefetchShops } from '@/hooks/usePrefetch';
import { AdBannerCarousel } from '@/components/shop/AdBannerCarousel';
import { useLanguage } from '@/contexts/LanguageContext';
import { useUserStatsContext } from '@/contexts/UserStatsContext';

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

function ShopStatusBadge({ isOpen, t }: { isOpen: boolean; t: (key: string) => string }) {
  return (
    <div className="flex items-center gap-1">
      <ClockIcon className="w-3 h-3" className={isOpen ? 'text-green-700 dark:text-green-500' : 'text-destructive'} />
      <span className={`text-xs font-medium ${isOpen ? 'text-green-700 dark:text-green-500' : 'text-destructive'}`}>
        {isOpen ? t('shops.open') : t('shops.closed')}
      </span>
    </div>
  );
}

function getShopBadges(shop: Shop): ShopBadgeData[] {
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

function hasSpecialtyBadge(shop: Shop): boolean {
  return getShopBadges(shop).some(b => b.text.toLowerCase() === 'specialty');
}

function parseCoordinates(coords: unknown): Coordinate[] {
  if (!coords || !Array.isArray(coords)) return [];
  return coords
    .filter((c): c is Coordinate => c && typeof c.lat === 'number' && typeof c.lng === 'number')
    .map(c => ({ lat: c.lat, lng: c.lng, working_hours: (c as any).working_hours }));
}

export default function ShopsPage() {
  const [activeFilter, setActiveFilter] = useState('all');
  const queryClient = useQueryClient();
  const { t } = useLanguage();
  const { profile } = useUserStatsContext();
  const userCountry = profile?.country || 'KZ';
  const userCity = profile?.city || null;

  const filters = [
    { id: 'all', label: t('shops.all') },
    { id: 'open', label: t('shops.open') },
    { id: 'specialty', label: 'Specialty' },
  ];

  const { data: shops = [], isLoading, refetch } = useQuery({
    queryKey: queryKeys.shops,
    queryFn: prefetchShops,
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
  });

  const handleRefresh = useCallback(async () => {
    await Promise.all([refetch(), queryClient.invalidateQueries({ queryKey: ['adBanners'] })]);
  }, [refetch, queryClient]);

  const shopCoordinates = useMemo(() => 
    shops.map(s => ({ id: s.id, coordinates: parseCoordinates(s.coordinates), shopWorkingHours: s.working_hours })), [shops]);

  const { distances, loading: distancesLoading, permissionDenied, userLocation } = useShopDistances(shopCoordinates);

  const shopsWithStatus = useMemo(() => shops
    .filter(shop => {
      if (shop.country && shop.country !== userCountry) return false;
      if (userCity && shop.city && shop.city !== userCity) return false;
      return true;
    })
    .map(shop => ({
      ...shop,
      isCurrentlyOpen: isAnyAddressOpen(shop.working_hours, Array.isArray(shop.coordinates) ? shop.coordinates as any : null),
      allBadges: getShopBadges(shop),
      isSpecialty: hasSpecialtyBadge(shop),
    })), [shops, userCountry, userCity]);
  
  const filteredAndSortedShops = useMemo(() => {
    let filtered = shopsWithStatus.filter(shop => {
      if (activeFilter === 'open' && !shop.isCurrentlyOpen) return false;
      if (activeFilter === 'specialty' && !shop.isSpecialty) return false;
      return true;
    });
    if (userLocation && distances.size > 0) filtered = sortByDistance(filtered, distances);
    // Sort closed shops to the bottom
    filtered.sort((a, b) => {
      if (a.isCurrentlyOpen === b.isCurrentlyOpen) return 0;
      return a.isCurrentlyOpen ? -1 : 1;
    });
    return filtered;
  }, [shopsWithStatus, activeFilter, distances, userLocation]);
  
  return (
    <AppLayout>
      <PullToRefresh onRefresh={handleRefresh}>
        <div>
          <LiquidGlassHeader>
            <div className="px-4 py-4">
              <h1 className="text-2xl font-black text-foreground">{t('shops.title')}</h1>
            </div>
          </LiquidGlassHeader>
          <div className="px-4 pt-2">
            
            <AdBannerCarousel location="shops" />

            {permissionDenied && (
              <div className="flex items-center gap-2 px-3 py-2 bg-muted/50 rounded-xl mb-4 text-sm text-muted-foreground">
                <MapPinOff size={16} />
                <span>{t('shops.enableLocation')}</span>
              </div>
            )}
            
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
                  
                  return (
                    <div key={shop.id} className="block animate-slide-up" style={{ animationDelay: `${index * 0.05}s` }}>
                      <Link to={`/shops/${shop.id}`} className="card-interactive block">
                        <div className="flex items-start gap-3">
                          {(shop.gallery_urls?.[0] || shop.logo_url) ? (
                            <img src={shop.gallery_urls?.[0] || shop.logo_url!} alt={shop.name} loading="lazy" className="w-16 h-16 rounded-xl object-cover shrink-0" />
                          ) : (
                            <div className="w-16 h-16 rounded-xl bg-secondary flex items-center justify-center text-2xl shrink-0">☕</div>
                          )}
                          
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <h3 className="font-bold text-foreground truncate">{shop.name}</h3>
                              <span className={`text-xs whitespace-nowrap ${shopDistance?.distance != null ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>
                                {formatDistance(shopDistance?.distance)}
                              </span>
                            </div>
                            <div onClick={(e) => e.preventDefault()}>
                              <AddressesList addresses={addresses} variant="compact" className="mt-2" closestIndex={addresses.length > 1 ? closestIndex : undefined} coordinates={Array.isArray(shop.coordinates) ? shop.coordinates as any : undefined} shopWorkingHours={shop.working_hours || undefined} />
                            </div>
                            <div className="flex items-center gap-2 mt-1 flex-wrap">
                              {shop.city && (
                                <div className="flex items-center gap-1">
                                  <Navigation size={12} className="text-muted-foreground" />
                                  <span className="text-xs text-muted-foreground">{shop.city}</span>
                                </div>
                              )}
                              <ShopStatusBadge isOpen={shop.isCurrentlyOpen} t={t} />
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
                <p className="text-lg font-semibold text-foreground mb-2">{t('shops.noShops')}</p>
                <p className="text-sm text-muted-foreground">{t('shops.changeFilter')}</p>
              </div>
            )}
          </div>
        </div>
      </PullToRefresh>
    </AppLayout>
  );
}
