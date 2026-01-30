import { useState, useEffect, useMemo } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { supabase } from '@/integrations/supabase/client';
import { Clock, MapPin, Navigation, Loader2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { isShopOpen } from '@/utils/shopHours';
import { AddressesList } from '@/components/shop/AddressesList';

interface Shop {
  id: string;
  name: string;
  address: string | null;
  addresses: string[] | null;
  city: string | null;
  working_hours: string | null;
  is_active: boolean;
  logo_url: string | null;
}

const filters = [
  { id: 'all', label: 'Все' },
  { id: 'open', label: 'Открыто' },
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
    }));
  }, [shops]);
  
  const filteredShops = shopsWithStatus.filter(shop => {
    if (activeFilter === 'open') return shop.isCurrentlyOpen;
    return true;
  });
  
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
                <Link
                  key={shop.id}
                  to={`/shops/${shop.id}`}
                  className="block animate-slide-up"
                  style={{ animationDelay: `${index * 0.05}s` }}
                >
                  <div className="card-interactive">
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
                        </div>
                        
                        {/* Addresses */}
                        <AddressesList 
                          addresses={shop.addresses || (shop.address ? [shop.address] : [])} 
                          variant="compact"
                          className="mt-2"
                        />
                        <div className="flex items-center gap-4 mt-1">
                          {shop.city && (
                            <div className="flex items-center gap-1">
                              <Navigation size={12} className="text-muted-foreground" />
                              <span className="text-xs text-muted-foreground">{shop.city}</span>
                            </div>
                          )}
                          {shop.working_hours && (
                            <ShopStatusBadge openHours={shop.working_hours} />
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </Link>
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
