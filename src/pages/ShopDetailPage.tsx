import { useState, useEffect } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { supabase } from '@/integrations/supabase/client';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Clock, MapPin, Coffee, Droplets, Loader2, Navigation } from 'lucide-react';
import { useUserStatsContext } from '@/contexts/UserStatsContext';
import { useShopStatus } from '@/utils/shopHours';
import { ShopBadgesList, ShopBadgeData } from '@/components/shop/ShopBadgesList';
import { useShopDistances, Coordinate } from '@/hooks/useShopDistances';
import { formatDistance, formatDuration } from '@/utils/distance';
interface Shop {
  id: string;
  name: string;
  address: string | null;
  addresses: string[] | null;
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
function getShopBadges(shop: Shop): ShopBadgeData[] {
  const badges: ShopBadgeData[] = [];
  if (shop.badges && Array.isArray(shop.badges)) {
    (shop.badges as Array<{
      text?: string;
      color?: string;
    }>).forEach(b => {
      if (b && b.text && b.color) {
        badges.push({
          text: b.text,
          color: b.color
        });
      }
    });
  }
  if (badges.length === 0 && shop.badge_text && shop.badge_color) {
    badges.push({
      text: shop.badge_text,
      color: shop.badge_color
    });
  }
  return badges;
}
export default function ShopDetailPage() {
  const {
    id
  } = useParams();
  const navigate = useNavigate();
  const {
    stats
  } = useUserStatsContext();
  const [shop, setShop] = useState<Shop | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const shopStatus = useShopStatus(shop?.working_hours || '');

  // Get distance for this shop
  const {
    distances,
    userLocation
  } = useShopDistances(shop ? [{
    id: shop.id,
    coordinates: parseCoordinates(shop.coordinates)
  }] : []);
  const shopDistance = shop ? distances.get(shop.id) : undefined;
  useEffect(() => {
    if (id) {
      fetchShop(id);
    }
  }, [id]);
  const fetchShop = async (shopId: string) => {
    try {
      const {
        data,
        error
      } = await supabase.from('shops').select('*').eq('id', shopId).maybeSingle();
      if (error) throw error;
      setShop(data);
    } catch (error) {
      console.error('Error fetching shop:', error);
    } finally {
      setIsLoading(false);
    }
  };
  if (isLoading) {
    return <AppLayout>
        <div className="safe-area-top p-4 flex items-center justify-center min-h-[50vh]">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </AppLayout>;
  }
  if (!shop) {
    return <AppLayout>
        <div className="safe-area-top p-4">
          <Link to="/shops" className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center mb-4">
            <ArrowLeft size={20} className="text-foreground" />
          </Link>
          <p className="text-center text-muted-foreground">Кофейня не найдена</p>
        </div>
      </AppLayout>;
  }
  const handleRedeem = () => {
    navigate('/redeem', {
      state: {
        shop: {
          id: shop.id,
          name: shop.name,
          address: shop.address
        },
        drinkType: 'coffee',
        drinkName: 'Кофе'
      }
    });
  };
  return <AppLayout>
      <div className="safe-area-top">
        {/* Header */}
        <div className="px-4 py-4 flex items-center gap-3">
          <Link to="/shops" className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center">
            <ArrowLeft size={20} className="text-foreground" />
          </Link>
          <h1 className="text-xl font-bold text-foreground flex-1 truncate">{shop.name}</h1>
        </div>
        
        {/* Hero */}
        <div className="px-4 mb-6">
          {shop.logo_url ? <img src={shop.logo_url} alt={shop.name} className="w-full h-48 rounded-2xl object-cover animate-pop" /> : <div className="w-full h-48 rounded-2xl bg-secondary flex items-center justify-center text-6xl animate-pop">
              ☕
            </div>}
        </div>
        
        {/* Info */}
        <div className="px-4 space-y-4">
          <div className="card-static animate-slide-up">
            <div className="flex items-center justify-between gap-4 mb-3">
              <div className={`flex items-center gap-1 ${shopStatus.isOpen ? 'text-accent' : 'text-destructive'}`}>
                <Clock size={12} />
                <span className="text-xs font-medium">
                  {shopStatus.isOpen ? `Открыто до ${shopStatus.closesAt}` : `Закрыто · откроется в ${shopStatus.opensAt}`}
                </span>
              </div>
              {/* Badges */}
              {getShopBadges(shop).length > 0 && <ShopBadgesList badges={getShopBadges(shop)} maxVisible={3} />}
            </div>

            {/* Distance and duration */}
            {shopDistance?.distance != null && <div className="flex items-center gap-2 mb-3 text-xs">
                <div className="flex items-center gap-1 text-foreground font-medium">
                  <Navigation size={14} className="text-accent" />
                  <span>{formatDistance(shopDistance.distance)}</span>
                </div>
                {shopDistance.duration != null && <span className="text-muted-foreground">
                    ~{formatDuration(shopDistance.duration)} на авто
                  </span>}
              </div>}
            
            <div className="flex items-start gap-2 text-muted-foreground">
              <MapPin size={14} className="mt-0.5 shrink-0" />
              <div className="flex-1">
                {shop.addresses && shop.addresses.length > 0 ? <div className="space-y-0.5">
                    {(() => {
                  const closestIndex = shopDistance?.closestAddressIndex ?? 0;
                  const addresses = shop.addresses;
                  const hasMultipleAddresses = addresses.length > 1;
                  // Reorder to show closest first
                  const reordered = closestIndex > 0 ? [addresses[closestIndex], ...addresses.filter((_, i) => i !== closestIndex)] : addresses;
                  return reordered.map((addr, index) => {
                    const isClosest = index === 0 && hasMultipleAddresses && shopDistance?.distance != null;
                    return (
                      <p key={index} className={`text-xs font-medium ${isClosest ? 'text-accent' : 'text-foreground'}`}>
                        {addr}
                      </p>
                    );
                  });
                })()}
                  </div> : shop.address ? <p className="text-xs font-medium text-foreground">{shop.address}</p> : <p className="text-xs font-medium text-foreground">Адрес не указан</p>}
                <p className="text-xs mt-1">{shop.working_hours || '—'}</p>
                {shop.city && <p className="text-xs">{shop.city}</p>}
              </div>
            </div>
          </div>
          
          {/* Available by package */}
          <div className="animate-slide-up" style={{
          animationDelay: '0.1s'
        }}>
            <h3 className="text-lg font-bold text-foreground mb-3">Доступно по подписке</h3>
            
            <div className="grid grid-cols-2 gap-3">
              <div className="card-static">
                <div className="flex items-center gap-2 mb-2">
                  <Coffee size={20} className="text-primary" />
                  <span className="font-semibold text-foreground">Кофе</span>
                </div>
                <p className="text-2xl font-black text-foreground">
                  {stats.coffeeRemaining}
                  <span className="text-sm text-muted-foreground font-medium ml-1">осталось</span>
                </p>
              </div>
              
              <div className="card-static">
                <div className="flex items-center gap-2 mb-2">
                  <Droplets size={20} className="text-accent" />
                  <span className="font-semibold text-foreground">Напитки</span>
                </div>
                <p className="text-2xl font-black text-foreground">
                  {stats.drinksRemaining}
                  <span className="text-sm text-muted-foreground font-medium ml-1">осталось</span>
                </p>
              </div>
            </div>
          </div>
          
          {/* CTA */}
          <div className="pb-6 pt-4 animate-slide-up" style={{
          animationDelay: '0.2s'
        }}>
            <button onClick={handleRedeem} disabled={!shopStatus.isOpen || stats.coffeeRemaining <= 0 && stats.drinksRemaining <= 0} className="btn-accent w-full text-lg disabled:opacity-50">
              {!shopStatus.isOpen ? 'Кофейня закрыта' : stats.coffeeRemaining <= 0 && stats.drinksRemaining <= 0 ? 'Нет доступных напитков' : 'Забрать здесь'}
            </button>
          </div>
        </div>
      </div>
    </AppLayout>;
}