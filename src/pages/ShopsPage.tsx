import { useState, useEffect, useMemo } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { supabase } from '@/integrations/supabase/client';
import { Clock, MapPin, Navigation, Loader2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { isShopOpen } from '@/utils/shopHours';
import { AddressesList } from '@/components/shop/AddressesList';
import { ShopBadgesList, ShopBadgeData } from '@/components/shop/ShopBadgesList';

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
}

const filters = [
  { id: 'all', label: 'Все' },
  { id: 'open', label: 'Открыто' },
  { id: 'specialty', label: 'Specialty' },
];

// Component to display shop status with real-time check
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

// Helper to get all badges from a shop (combining old and new format)
function getShopBadges(shop: Shop): ShopBadgeData[] {
  const badges: ShopBadgeData[] = [];
  
  // First add badges from new jsonb array
  if (shop.badges && Array.isArray(shop.badges)) {
    (shop.badges as Array<{ text?: string; color?: string }>).forEach(b => {
      if (b && b.text && b.color) {
        badges.push({ text: b.text, color: b.color });
      }
    });
  }
  
  // If no badges from new format, fall back to legacy single badge
  if (badges.length === 0 && shop.badge_text && shop.badge_color) {
    badges.push({ text: shop.badge_text, color: shop.badge_color });
  }
  
  return badges;
}

// Check if shop has specialty badge
function hasSpecialtyBadge(shop: Shop): boolean {
  const badges = getShopBadges(shop);
  return badges.some(b => b.text.toLowerCase() === 'specialty');
}

export default function ShopsPage() {
  const [activeFilter, setActiveFilter] = useState('all');
  const [shops, setShops] = useState<Shop[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchShops();
  }, []);

  const fetchShops = async () => {
    try {
      const { data, error } = await supabase
        .from('shops')
        .select('*')
        .eq('is_active', true)
        .order('sort_order', { ascending: true });

      if (error) throw error;
      setShops(data || []);
    } catch (error) {
      console.error('Error fetching shops:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Add real-time open status to shops
  const shopsWithStatus = useMemo(() => {
    return shops.map(shop => ({
      ...shop,
      isCurrentlyOpen: shop.working_hours ? isShopOpen(shop.working_hours) : false,
      allBadges: getShopBadges(shop),
      isSpecialty: hasSpecialtyBadge(shop),
    }));
  }, [shops]);
  
  const filteredShops = useMemo(() => {
    return shopsWithStatus.filter(shop => {
      // Open filter
      if (activeFilter === 'open' && !shop.isCurrentlyOpen) return false;
      
      // Specialty filter
      if (activeFilter === 'specialty' && !shop.isSpecialty) return false;
      
      return true;
    });
  }, [shopsWithStatus, activeFilter]);
  
  return (
    <AppLayout>
      <div className="safe-area-top">
        <div className="px-4 py-4">
          <h1 className="text-2xl font-black text-foreground mb-4">Кофейни</h1>
          
          {/* Map placeholder */}
          <div className="w-full h-40 bg-secondary rounded-2xl mb-4 flex items-center justify-center relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-b from-secondary to-muted opacity-50" />
            <div className="relative flex flex-col items-center gap-2">
              <MapPin size={32} className="text-primary" />
              <span className="text-sm font-medium text-muted-foreground">Карта кофеен</span>
            </div>
          </div>
          
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
          ) : filteredShops.length > 0 ? (
            <div className="space-y-3">
              {filteredShops.map((shop, index) => (
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
                      {shop.logo_url ? (
                        <img src={shop.logo_url} alt={shop.name} className="w-16 h-16 rounded-xl object-cover shrink-0" />
                      ) : (
                        <div className="w-16 h-16 rounded-xl bg-secondary flex items-center justify-center text-2xl shrink-0">
                          ☕
                        </div>
                      )}
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="font-bold text-foreground truncate">{shop.name}</h3>
                          {/* Distance placeholder for Google Maps integration */}
                          <span className="text-xs text-muted-foreground whitespace-nowrap">— м</span>
                        </div>
                        
                        {/* Addresses - clickable area stops propagation */}
                        <div onClick={(e) => e.preventDefault()}>
                          <AddressesList 
                            addresses={shop.addresses || (shop.address ? [shop.address] : [])} 
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
                          {/* Badges inline after status */}
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
