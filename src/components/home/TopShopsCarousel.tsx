import { useState, useEffect, useRef } from 'react';
import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Skeleton } from '@/components/ui/skeleton';
import { isShopOpen } from '@/utils/shopHours';

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
  const [activeIndex, setActiveIndex] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchShops();
  }, []);

  // Handle scroll to update active indicator
  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;

    const handleScroll = () => {
      const scrollLeft = container.scrollLeft;
      const itemWidth = 128 + 10; // w-32 (128px) + gap (10px)
      const newIndex = Math.round(scrollLeft / itemWidth);
      setActiveIndex(Math.min(newIndex, shops.length - 1));
    };

    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, [shops.length]);

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
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="flex-shrink-0 flex flex-col items-center w-20">
              <Skeleton className="w-16 h-16 rounded-full mb-1.5" />
              <Skeleton className="h-3 w-14" />
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
      
      <div 
        ref={scrollRef}
        className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide -mx-4 px-4 snap-x snap-mandatory"
      >
        {shops.map((shop) => {
          const isOpen = shop.working_hours ? isShopOpen(shop.working_hours) : false;
          
          return (
            <Link
              key={shop.id}
              to={`/shops/${shop.id}`}
              className="flex-shrink-0 flex flex-col items-center w-20 snap-start group"
            >
              {/* Round Shop Image with Status Indicator */}
              <div className="relative w-16 h-16 mb-1.5">
                <div className="w-full h-full rounded-full overflow-hidden bg-secondary shadow-md ring-2 ring-accent/20">
                  {shop.logo_url ? (
                    <img
                      src={shop.logo_url}
                      alt={shop.name}
                      className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-xl bg-gradient-to-br from-secondary to-muted">
                      ☕
                    </div>
                  )}
                </div>
                {/* Open/Closed Indicator */}
                <div className={`absolute bottom-0 right-0 w-4 h-4 rounded-full border-2 border-background ${
                  isOpen ? 'bg-accent' : 'bg-destructive'
                }`} />
              </div>
              
              {/* Shop Name */}
              <h3 className="font-medium text-foreground text-xs text-center truncate w-full px-1">{shop.name}</h3>
            </Link>
          );
        })}
      </div>
      
      {/* Active pagination dots */}
      {shops.length > 3 && (
        <div className="flex justify-center gap-1.5 mt-2">
          {shops.map((_, i) => (
            <div
              key={i}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i === activeIndex 
                  ? 'w-4 bg-accent' 
                  : 'w-1.5 bg-muted-foreground/30'
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
