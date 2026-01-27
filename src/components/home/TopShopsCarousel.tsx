import { useState, useEffect } from 'react';
import { ChevronRight, Star } from 'lucide-react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Skeleton } from '@/components/ui/skeleton';

interface Shop {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  working_hours: string | null;
  is_active: boolean;
  logo_url: string | null;
}

export function TopShopsCarousel() {
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
        .limit(10);

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
      <div className="animate-slide-up">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold text-foreground">Топ кофеен рядом</h2>
          <Link to="/shops" className="text-sm font-semibold text-accent flex items-center gap-1">
            Все
            <ChevronRight size={16} />
          </Link>
        </div>
        <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide -mx-4 px-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex-shrink-0 w-40">
              <Skeleton className="w-40 h-28 rounded-xl mb-2" />
              <Skeleton className="h-4 w-24 mb-1" />
              <Skeleton className="h-3 w-16" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (shops.length === 0) {
    return null;
  }

  return (
    <div className="animate-slide-up">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-bold text-foreground">Топ кофеен рядом</h2>
        <Link to="/shops" className="text-sm font-semibold text-accent flex items-center gap-1">
          Все
          <ChevronRight size={16} />
        </Link>
      </div>
      
      <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide -mx-4 px-4 snap-x snap-mandatory">
        {shops.map((shop) => (
          <Link
            key={shop.id}
            to={`/shops/${shop.id}`}
            className="flex-shrink-0 w-40 snap-start group"
          >
            {/* Shop Image */}
            <div className="relative w-40 h-28 rounded-xl overflow-hidden mb-2 bg-secondary">
              {shop.logo_url ? (
                <img
                  src={shop.logo_url}
                  alt={shop.name}
                  className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-4xl bg-gradient-to-br from-secondary to-muted">
                  ☕
                </div>
              )}
              {/* Gradient overlay */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent" />
            </div>
            
            {/* Shop Info */}
            <div className="space-y-1">
              <h3 className="font-semibold text-foreground text-sm truncate">{shop.name}</h3>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-0.5">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Star
                      key={star}
                      size={10}
                      className={star <= 4 ? 'fill-accent text-accent' : 'text-muted-foreground/30'}
                    />
                  ))}
                </div>
                <span className="text-xs text-muted-foreground">~500м</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
                <span className="text-xs font-medium text-accent">Подписка</span>
              </div>
            </div>
          </Link>
        ))}
      </div>
      
      {/* Pagination dots */}
      {shops.length > 2 && (
        <div className="flex justify-center gap-1.5 mt-3">
          {shops.slice(0, Math.min(5, Math.ceil(shops.length / 2))).map((_, i) => (
            <div
              key={i}
              className={`w-2 h-2 rounded-full transition-colors ${
                i === 0 ? 'bg-accent' : 'bg-muted-foreground/30'
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
