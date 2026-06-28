import { useState, useEffect, useMemo } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { supabase } from '@/integrations/supabase/client';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { ArrowLeft, Clock, MapPin, Coffee, Droplets, Loader2, Navigation, ExternalLink, ShoppingBag } from 'lucide-react';
import { useUserStatsContext } from '@/contexts/UserStatsContext';
import { useAddressAwareShopStatus } from '@/utils/shopHours';
import { ShopBadgesList, ShopBadgeData } from '@/components/shop/ShopBadgesList';
import { useShopDistances, Coordinate } from '@/hooks/useShopDistances';
import { formatDistance, formatDuration } from '@/utils/distance';
import { ShopGalleryCarousel } from '@/components/shop/ShopGalleryCarousel';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAutoTranslate } from '@/hooks/useAutoTranslate';
import { PreorderDialog } from '@/components/preorder/PreorderDialog';
import { useActiveSubscription } from '@/hooks/useActiveSubscription';

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
  description: string | null;
  supported_types: string[];
  preorders_enabled?: boolean;
}

function parseCoordinates(coords: unknown): Coordinate[] {
  if (!coords || !Array.isArray(coords)) return [];
  return coords.filter((c): c is Coordinate => c && typeof c.lat === 'number' && typeof c.lng === 'number');
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

export default function ShopDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { stats, refetch: refetchStats } = useUserStatsContext();
  const [shop, setShop] = useState<Shop | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [preorderOpen, setPreorderOpen] = useState(false);
  const { t } = useLanguage();
  const translatedDescription = useAutoTranslate(shop?.description);
  const { activeSubscriptionTypeIds } = useActiveSubscription();
  const hasActiveSubscription = activeSubscriptionTypeIds.length > 0;

  const statusCoordinates = useMemo(
    () => Array.isArray(shop?.coordinates) ? shop.coordinates as Array<{ working_hours?: string | null }> : [],
    [shop?.coordinates]
  );
  const shopCoordinates = useMemo(() =>
    shop ? [{ id: shop.id, coordinates: parseCoordinates(shop.coordinates) }] : [], [shop?.id, shop?.coordinates]);
  const { distances } = useShopDistances(shopCoordinates);
  const shopDistance = shop ? distances.get(shop.id) : undefined;
  const shopStatus = useAddressAwareShopStatus(shop?.working_hours, statusCoordinates, shopDistance?.closestAddressIndex);
  const isCurrentlyOpen = shopStatus.isOpen;

  const shopAddresses = useMemo(() => {
    if (shop?.addresses && shop.addresses.length > 0) return shop.addresses;
    if (shop?.address) return [shop.address];
    return [];
  }, [shop]);

  useEffect(() => { if (id) fetchShop(id); }, [id]);

  const fetchShop = async (shopId: string) => {
    try {
      const { data, error } = await supabase.from('shops').select('*').eq('id', shopId).maybeSingle();
      if (error) throw error;
      setShop(data);
    } catch (error) {
      console.error('Error fetching shop:', error);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return <AppLayout><div className="safe-area-top p-4 flex items-center justify-center min-h-[50vh]"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div></AppLayout>;
  }

  if (!shop) {
    return <AppLayout><div className="safe-area-top p-4">
      <Link to="/shops" className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center mb-4"><ArrowLeft size={20} className="text-foreground" /></Link>
      <p className="text-center text-muted-foreground">{t('shops.notFound')}</p>
    </div></AppLayout>;
  }

  const handleRedeem = () => {
    navigate('/redeem', { state: { shop: { id: shop.id, name: shop.name, address: shop.address }, drinkType: 'coffee', drinkName: t('balance.coffee') } });
  };

  const canPreorder = shop.preorders_enabled && hasActiveSubscription && stats.coffeeRemaining > 0;

  return <AppLayout>
    <div className="safe-area-top">
      <div className="px-4 py-4 flex items-center gap-3">
        <Link to="/shops" className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center"><ArrowLeft size={20} className="text-foreground" /></Link>
        <h1 className="text-xl font-bold text-foreground flex-1 truncate">{shop.name}</h1>
      </div>
      
      <div className="px-4 mb-6">
        <ShopGalleryCarousel images={shop.gallery_urls?.length ? shop.gallery_urls : (shop.logo_url ? [shop.logo_url] : [])} shopName={shop.name} autoplayInterval={3000} />
      </div>
      
      <div className="px-4 space-y-4">
        <div className="card-static animate-slide-up">
          <div className="flex items-center justify-between gap-4 mb-3">
             <div className={`flex items-center gap-1 ${isCurrentlyOpen ? 'text-green-700 dark:text-green-500' : 'text-destructive'}`}>
              <Clock size={12} />
              <span className="text-xs font-medium">
                {isCurrentlyOpen ? `${t('shops.openUntil')} ${shopStatus.closesAt ?? '—'}` : `${t('shops.closedOpensAt')} ${shopStatus.opensAt ?? '—'}`}
              </span>
            </div>
            {getShopBadges(shop).length > 0 && <ShopBadgesList badges={getShopBadges(shop)} maxVisible={3} />}
          </div>

          {shopDistance?.distance != null && <div className="flex items-center justify-between gap-2 mb-3 text-xs">
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 text-foreground font-medium">
                <Navigation size={14} className="text-green-700 dark:text-green-500" />
                <span>{formatDistance(shopDistance.distance)}</span>
              </div>
              {shopDistance.duration != null && <span className="text-muted-foreground">~{formatDuration(shopDistance.duration)} {t('shops.byCar')}</span>}
            </div>
            <button
              onClick={() => {
                const coords = parseCoordinates(shop.coordinates);
                const idx = shopDistance.closestAddressIndex;
                const coord = coords[idx] || coords[0];
                if (!coord) return;
                const twogisLink = (coord as any).twogis_link;
                const webUrl = twogisLink || (coord.lat && coord.lng
                  ? `https://2gis.kz/atyrau/directions/points/%7C${coord.lng}%2C${coord.lat}`
                  : null);
                if (!webUrl) return;

                // In Telegram Mini App, custom URL schemes (dgis://) are sandboxed and
                // location.href navigation is unreliable (works "every other time" or not
                // at all). openLink() routes through Telegram's native layer, which lets
                // the OS App Links mechanism launch the 2GIS app from the https URL.
                const tgWebApp = window.Telegram?.WebApp as { initData?: string; openLink?: (url: string) => void } | undefined;
                if (tgWebApp?.initData && tgWebApp?.openLink) {
                  tgWebApp.openLink(webUrl);
                  return;
                }

                if (coord.lat && coord.lng) {
                  const dgisDeepLink = `dgis://2gis.ru/routeSearch/rsType/car/to/${coord.lng},${coord.lat}`;
                  if (Capacitor.isNativePlatform()) {
                    window.open(dgisDeepLink, '_system');
                  } else {
                    // Try deep link — opens 2GIS app directly without browser overlay
                    window.location.href = dgisDeepLink;
                    // Fallback to web if 2GIS app not installed (window stays visible)
                    const fallback = setTimeout(() => window.open(webUrl, '_blank'), 1500);
                    window.addEventListener('blur', () => clearTimeout(fallback), { once: true });
                  }
                } else {
                  window.open(webUrl, '_blank');
                }
              }}
              className="flex items-center gap-1 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
            >
              <ExternalLink size={12} />
              <span>{t('shops.getDirections') || 'Добраться'}</span>
            </button>
          </div>}
          
          <div className="flex items-start gap-2 text-muted-foreground">
            <MapPin size={14} className="mt-0.5 shrink-0" />
            <div className="flex-1">
              {shop.addresses && shop.addresses.length > 0 ? <div className="space-y-0.5">
                {(() => {
                  const closestIndex = shopDistance?.closestAddressIndex ?? 0;
                  const addresses = shop.addresses;
                  const hasMultipleAddresses = addresses.length > 1;
                  const reordered = closestIndex > 0 ? [addresses[closestIndex], ...addresses.filter((_, i) => i !== closestIndex)] : addresses;
                  return reordered.map((addr, index) => {
                    const isClosest = index === 0 && hasMultipleAddresses && shopDistance?.distance != null;
                    return <p key={index} className={`text-xs font-medium ${isClosest ? 'text-green-700 dark:text-green-500' : 'text-foreground'}`}>{addr}</p>;
                  });
                })()}
              </div> : shop.address ? <p className="text-xs font-medium text-foreground">{shop.address}</p> : <p className="text-xs font-medium text-foreground">{t('shops.addressNotSet')}</p>}
              <p className="text-xs mt-1">{shopStatus.hours || '—'}</p>
              {shop.city && <p className="text-xs">{shop.city}</p>}
            </div>
          </div>
        </div>
        
        {/* Preorder button - between address and description */}
        {canPreorder && (
          <div className="animate-slide-up" style={{ animationDelay: '0.05s' }}>
            <button
              onClick={() => isCurrentlyOpen && setPreorderOpen(true)}
              disabled={!isCurrentlyOpen}
              className={`w-full py-3 rounded-xl border-2 font-semibold text-sm flex items-center justify-center gap-2 transition-all ${
                isCurrentlyOpen 
                  ? 'border-primary text-primary active:scale-[0.98]' 
                  : 'border-muted text-muted-foreground cursor-not-allowed opacity-60'
              }`}
            >
              <ShoppingBag size={18} />
              {isCurrentlyOpen ? 'Сделать предзаказ' : 'Предзаказ доступен после открытия'}
            </button>
          </div>
        )}

        {shop.description && (
          <div className="card-static animate-slide-up" style={{ animationDelay: '0.1s' }}>
            <h3 className="text-sm font-bold text-foreground mb-1.5">{shop.name}</h3>
            <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-line">{translatedDescription}</p>
          </div>
        )}

        <div className="animate-slide-up" style={{ animationDelay: '0.15s' }}>
          <h3 className="text-lg font-bold text-foreground mb-3">{t('shops.bySubscription')}</h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="card-static">
              <div className="flex items-center gap-2 mb-2">
                <Coffee size={20} className="text-primary" />
                <span className="font-semibold text-foreground">{t('balance.coffee')}</span>
              </div>
              <p className="text-2xl font-black text-foreground">
                {stats.coffeeRemaining}
                <span className="text-sm text-muted-foreground font-medium ml-1">{t('shops.remaining')}</span>
              </p>
            </div>
            <div className="card-static">
              <div className="flex items-center gap-2 mb-2">
                <Droplets size={20} className="text-accent" />
                <span className="font-semibold text-foreground">{t('balance.drinks')}</span>
              </div>
              {shop.supported_types?.includes('drinks') ? (
                <p className="text-2xl font-black text-foreground">
                  {stats.drinksRemaining}
                  <span className="text-sm text-muted-foreground font-medium ml-1">{t('shops.remaining')}</span>
                </p>
              ) : (
                <p className="text-sm font-medium text-muted-foreground">{t('shops.notAvailable') || 'Не доступно'}</p>
              )}
            </div>
          </div>
        </div>

        <div className="pb-6 pt-4 animate-slide-up" style={{ animationDelay: '0.2s' }}>
          {!isCurrentlyOpen ? (
            <button disabled className="btn-accent w-full text-lg disabled:opacity-50">
              {t('shops.shopClosed')}
            </button>
          ) : stats.coffeeRemaining <= 0 && stats.drinksRemaining <= 0 ? (
            <button onClick={() => navigate('/packages')} className="btn-accent w-full text-lg">
              Оформить подписку
            </button>
          ) : (
            <button onClick={handleRedeem} className="btn-accent w-full text-lg">
              {t('shops.pickupHere')}
            </button>
          )}
        </div>
      </div>
    </div>

    {shop && (
      <PreorderDialog
        open={preorderOpen}
        onOpenChange={setPreorderOpen}
        shopId={shop.id}
        shopName={shop.name}
        coffeeRemaining={stats.coffeeRemaining}
        addresses={shopAddresses}
        onComplete={refetchStats}
      />
    )}
  </AppLayout>;
}
