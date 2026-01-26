import { AppLayout } from '@/components/layout/AppLayout';
import { coffeeShops } from '@/data/mockData';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Star, Clock, MapPin, Coffee, Droplets } from 'lucide-react';
import { useUserStatsContext } from '@/contexts/UserStatsContext';
import { useShopStatus } from '@/utils/shopHours';

export default function ShopDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { stats } = useUserStatsContext();
  
  const shop = coffeeShops.find(s => s.id === id);
  const shopStatus = useShopStatus(shop?.openHours || '');
  
  if (!shop) {
    return (
      <AppLayout>
        <div className="safe-area-top p-4">
          <p className="text-center text-muted-foreground">Кофейня не найдена</p>
        </div>
      </AppLayout>
    );
  }
  
  const handleRedeem = () => {
    navigate('/redeem', { state: { shop, drinkType: 'coffee', drinkName: 'Капучино' } });
  };
  
  return (
    <AppLayout>
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
          <div className="w-full h-48 rounded-2xl bg-secondary flex items-center justify-center text-6xl animate-pop">
            ☕
          </div>
        </div>
        
        {/* Info */}
        <div className="px-4 space-y-4">
          <div className="card-static animate-slide-up">
            <div className="flex items-center gap-4 mb-4">
              <div className="flex items-center gap-1">
                <Star size={18} className="text-yellow-500 fill-yellow-500" />
                <span className="font-bold text-foreground">{shop.rating}</span>
              </div>
              <div className={`flex items-center gap-1 ${shopStatus.isOpen ? 'text-accent' : 'text-destructive'}`}>
                <Clock size={18} />
                <span className="font-medium">
                  {shopStatus.isOpen 
                    ? `Открыто до ${shopStatus.closesAt}` 
                    : `Закрыто · откроется в ${shopStatus.opensAt}`
                  }
                </span>
              </div>
            </div>
            
            <div className="flex items-start gap-2 text-muted-foreground">
              <MapPin size={18} className="mt-0.5 shrink-0" />
              <div>
                <p className="font-medium text-foreground">{shop.address}</p>
                <p className="text-sm">{shop.openHours}</p>
              </div>
            </div>
          </div>
          
          {/* Available by package */}
          <div className="animate-slide-up" style={{ animationDelay: '0.1s' }}>
            <h3 className="text-lg font-bold text-foreground mb-3">Доступно по пакету</h3>
            
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
          
          {/* Drinks available */}
          <div className="animate-slide-up" style={{ animationDelay: '0.15s' }}>
            <h3 className="text-lg font-bold text-foreground mb-3">Напитки здесь</h3>
            <div className="flex flex-wrap gap-2">
              {shop.availableDrinks.map((drink) => (
                <span key={drink} className="px-3 py-2 bg-secondary rounded-xl text-sm font-medium text-secondary-foreground">
                  {drink}
                </span>
              ))}
            </div>
          </div>
          
          {/* CTA */}
          <div className="pb-6 pt-4 animate-slide-up" style={{ animationDelay: '0.2s' }}>
            <button 
              onClick={handleRedeem}
              disabled={!shopStatus.isOpen || (stats.coffeeRemaining <= 0 && stats.drinksRemaining <= 0)}
              className="btn-accent w-full text-lg disabled:opacity-50"
            >
              {!shopStatus.isOpen 
                ? 'Кофейня закрыта' 
                : (stats.coffeeRemaining <= 0 && stats.drinksRemaining <= 0)
                  ? 'Нет доступных напитков'
                  : 'Забрать здесь'
              }
            </button>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
