import { ChevronRight, Clock, Loader2, TrendingUp } from 'lucide-react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { isShopOpen } from '@/utils/shopHours';
import { useState, useEffect } from 'react';

interface ShopWithVisits {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  working_hours: string | null;
  is_active: boolean;
  logo_url: string | null;
  visit_count: number;
}

export function NearbyShops() {
  const [shops, setShops] = useState<ShopWithVisits[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchShopsWithVisits();
  }, []);

  const fetchShopsWithVisits = async () => {
    try {
      // Fetch all active shops and global visit counts in parallel
      const [shopsResult, visitsResult] = await Promise.all([
        supabase.from('shops').select('*').eq('is_active', true),
        supabase.rpc('get_shop_visit_counts')
      ]);

      if (shopsResult.error) throw shopsResult.error;

      // Build visit counts map from global stats
      const visitCounts: Record<string, number> = {};
      (visitsResult.data || []).forEach((r: { shop_id: string; visit_count: number }) => {
        visitCounts[r.shop_id] = r.visit_count;
      });

      // Map shops with visit counts and sort by visits
      const shopsWithVisits: ShopWithVisits[] = (shopsResult.data || []).map(shop => ({
        ...shop,
        visit_count: visitCounts[shop.id] || 0
      }));

      // Sort by visit count descending
      shopsWithVisits.sort((a, b) => b.visit_count - a.visit_count);

      setShops(shopsWithVisits.slice(0, 3));
    } catch (error) {
      console.error('Error fetching shops:', error);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="animate-slide-up" style={{ animationDelay: '0.15s' }}>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-bold text-foreground">Топ по посещениям</h2>
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
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-bold text-foreground">Топ по посещениям</h2>
        </div>
        <p className="text-center text-muted-foreground py-4">Нет доступных кофеен</p>
      </div>
    );
  }
  
  return (
    <div className="animate-slide-up" style={{ animationDelay: '0.15s' }}>
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-lg font-bold text-foreground">Топ по посещениям</h2>
        <Link to="/shops" className="text-sm font-semibold text-accent flex items-center gap-1">
          Все
          <ChevronRight size={16} />
        </Link>
      </div>
      
      <div className="space-y-1.5">
        {shops.map((shop, index) => {
          const isOpen = shop.working_hours ? isShopOpen(shop.working_hours) : false;
          
          return (
            <Link
              key={shop.id}
              to={`/shops/${shop.id}`}
              className="card-interactive flex items-center gap-3 py-2.5 px-3"
            >
              {/* Rank badge */}
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                index === 0 ? 'bg-accent text-accent-foreground' :
                index === 1 ? 'bg-primary/20 text-primary' :
                'bg-secondary text-muted-foreground'
              }`}>
                {index + 1}
              </div>
              
              {shop.logo_url ? (
                <img src={shop.logo_url} alt={shop.name} className="w-11 h-11 rounded-xl object-cover" />
              ) : (
                <div className="w-11 h-11 rounded-xl bg-secondary flex items-center justify-center text-xl">
                  ☕
                </div>
              )}
              
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-foreground text-sm truncate">{shop.name}</p>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <TrendingUp size={10} />
                    {shop.visit_count} покупок
                  </span>
                  <span className={`text-xs font-medium ${isOpen ? 'text-accent' : 'text-destructive'}`}>
                    · {isOpen ? 'Открыто' : 'Закрыто'}
                  </span>
                </div>
              </div>
              
              <div className="text-right">
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock size={12} />
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
