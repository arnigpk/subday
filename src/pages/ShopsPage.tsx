import { useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { coffeeShops } from '@/data/mockData';
import { Star, Clock, MapPin, Navigation } from 'lucide-react';
import { Link } from 'react-router-dom';

const filters = [
  { id: 'all', label: 'Все' },
  { id: 'open', label: 'Открыто' },
  { id: 'nearby', label: 'Рядом' },
  { id: 'top', label: 'Топ' },
];

export default function ShopsPage() {
  const [activeFilter, setActiveFilter] = useState('all');
  
  const filteredShops = coffeeShops.filter(shop => {
    if (activeFilter === 'open') return shop.isOpen;
    if (activeFilter === 'nearby') return parseFloat(shop.distance) < 1;
    if (activeFilter === 'top') return shop.rating >= 4.8;
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
          {filteredShops.length > 0 ? (
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
                      <div className="w-16 h-16 rounded-xl bg-secondary flex items-center justify-center text-2xl shrink-0">
                        ☕
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="font-bold text-foreground truncate">{shop.name}</h3>
                          <div className="flex items-center gap-1 shrink-0">
                            <Star size={14} className="text-yellow-500 fill-yellow-500" />
                            <span className="text-sm font-semibold text-foreground">{shop.rating}</span>
                          </div>
                        </div>
                        
                        <p className="text-sm text-muted-foreground truncate">{shop.address}</p>
                        
                        <div className="flex items-center gap-4 mt-2">
                          <div className="flex items-center gap-1">
                            <Navigation size={12} className="text-muted-foreground" />
                            <span className="text-xs text-muted-foreground">{shop.distance}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Clock size={12} className={shop.isOpen ? 'text-accent' : 'text-destructive'} />
                            <span className={`text-xs font-medium ${shop.isOpen ? 'text-accent' : 'text-destructive'}`}>
                              {shop.isOpen ? 'Открыто' : 'Закрыто'}
                            </span>
                          </div>
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
              <p className="text-lg font-semibold text-foreground mb-2">Рядом пусто</p>
              <p className="text-sm text-muted-foreground">Но ты не сдавайся, расширь поиск</p>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
