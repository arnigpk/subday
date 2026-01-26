import { ChevronRight, Star, Clock } from 'lucide-react';
import { Link } from 'react-router-dom';
import { coffeeShops } from '@/data/mockData';
import { isShopOpen } from '@/utils/shopHours';
import { useMemo } from 'react';

export function NearbyShops() {
  // Filter shops that are currently open based on real time
  const nearbyShops = useMemo(() => {
    return coffeeShops
      .filter(shop => isShopOpen(shop.openHours))
      .slice(0, 3);
  }, []);
  
  // If no shops are open, show all shops but indicate they're closed
  const shopsToShow = nearbyShops.length > 0 
    ? nearbyShops 
    : coffeeShops.slice(0, 3);
  
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
        {shopsToShow.map((shop) => {
          const isOpen = isShopOpen(shop.openHours);
          
          return (
            <Link
              key={shop.id}
              to={`/shops/${shop.id}`}
              className="card-interactive flex items-center gap-3"
            >
              <div className="w-14 h-14 rounded-xl bg-secondary flex items-center justify-center text-2xl">
                ☕
              </div>
              
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-foreground truncate">{shop.name}</p>
                <div className="flex items-center gap-2">
                  <p className="text-sm text-muted-foreground truncate">{shop.address}</p>
                  <span className={`text-xs font-medium ${isOpen ? 'text-accent' : 'text-destructive'}`}>
                    · {isOpen ? 'Открыто' : 'Закрыто'}
                  </span>
                </div>
              </div>
              
              <div className="text-right">
                <div className="flex items-center gap-1 text-sm font-medium text-foreground">
                  <Star size={14} className="text-yellow-500 fill-yellow-500" />
                  {shop.rating}
                </div>
                <p className="text-xs text-muted-foreground">{shop.distance}</p>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
