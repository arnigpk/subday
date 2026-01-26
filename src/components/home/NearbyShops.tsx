import { ChevronRight, Clock, Loader2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { isShopOpen } from '@/utils/shopHours';
import { useState, useEffect } from 'react';

interface Shop {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  working_hours: string | null;
  is_active: boolean;
  logo_url: string | null;
}

export function NearbyShops() {
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
        .order('sort_order', { ascending: true })
        .limit(3);

      if (error) throw error;
      setShops(data || []);
    } catch (error) {
      console.error('Error fetching shops:', error);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="animate-slide-up" style={{ animationDelay: '0.15s' }}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold text-foreground">Кофейни рядом</h2>
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
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold text-foreground">Кофейни рядом</h2>
        </div>
        <p className="text-center text-muted-foreground py-4">Нет доступных кофеен</p>
      </div>
    );
  }
  
  return (
    <div className="animate-slide-up" style={{ animationDelay: '0.15s' }}>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-bold text-foreground">Кофейни рядом</h2>
        <Link to="/shops" className="text-sm font-semibold text-accent flex items-center gap-1">
          Все
          <ChevronRight size={16} />
        </Link>
      </div>
      
      <div className="space-y-2">
        {shops.map((shop) => {
          const isOpen = shop.working_hours ? isShopOpen(shop.working_hours) : false;
          
          return (
            <Link
              key={shop.id}
              to={`/shops/${shop.id}`}
              className="card-interactive flex items-center gap-3"
            >
              {shop.logo_url ? (
                <img src={shop.logo_url} alt={shop.name} className="w-14 h-14 rounded-xl object-cover" />
              ) : (
                <div className="w-14 h-14 rounded-xl bg-secondary flex items-center justify-center text-2xl">
                  ☕
                </div>
              )}
              
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-foreground truncate">{shop.name}</p>
                <div className="flex items-center gap-2">
                  <p className="text-sm text-muted-foreground truncate">{shop.address || shop.city}</p>
                  <span className={`text-xs font-medium ${isOpen ? 'text-accent' : 'text-destructive'}`}>
                    · {isOpen ? 'Открыто' : 'Закрыто'}
                  </span>
                </div>
              </div>
              
              <div className="text-right">
                <div className="flex items-center gap-1 text-sm text-muted-foreground">
                  <Clock size={14} />
                  {shop.working_hours || '—'}
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
