import { Link } from 'react-router-dom';
import { Coffee, Droplets, ChevronRight, History } from 'lucide-react';
import { useUserStatsContext } from '@/contexts/UserStatsContext';
import { format, parseISO } from 'date-fns';
import { ru } from 'date-fns/locale';

export function PurchaseHistorySection() {
  const { redemptions, isLoading } = useUserStatsContext();
  
  // Show only last 3 items
  const recentItems = redemptions.slice(0, 3);
  
  const formatDate = (dateStr: string) => {
    try {
      const date = parseISO(dateStr);
      return format(date, 'd MMM', { locale: ru });
    } catch {
      return dateStr;
    }
  };
  
  if (isLoading) {
    return (
      <div className="mb-6 animate-slide-up">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-foreground flex items-center gap-2">
            <History size={18} className="text-muted-foreground" />
            История покупок
          </h3>
        </div>
        <div className="space-y-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="card-static flex items-center gap-3 py-3 animate-pulse">
              <div className="w-10 h-10 rounded-xl bg-muted" />
              <div className="flex-1">
                <div className="h-4 w-20 bg-muted rounded mb-1" />
                <div className="h-3 w-24 bg-muted rounded" />
              </div>
              <div className="h-3 w-12 bg-muted rounded" />
            </div>
          ))}
        </div>
      </div>
    );
  }
  
  if (redemptions.length === 0) {
    return (
      <div className="mb-6 animate-slide-up">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-foreground flex items-center gap-2">
            <History size={18} className="text-muted-foreground" />
            История покупок
          </h3>
        </div>
        <div className="card-static text-center py-6">
          <p className="text-sm text-muted-foreground">Пока нет покупок</p>
        </div>
      </div>
    );
  }
  
  return (
    <div className="mb-6 animate-slide-up">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-bold text-foreground flex items-center gap-2">
          <History size={18} className="text-muted-foreground" />
          История покупок
        </h3>
        <Link 
          to="/history" 
          className="text-sm text-primary font-medium flex items-center gap-1"
        >
          Все
          <ChevronRight size={16} />
        </Link>
      </div>
      
      <div className="space-y-2">
        {recentItems.map((item) => (
          <div 
            key={item.id} 
            className="card-static flex items-center gap-3 py-3"
          >
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
              item.drinkType === 'coffee' ? 'bg-primary/10' : 'bg-accent/10'
            }`}>
              {item.drinkType === 'coffee' ? (
                <Coffee size={20} className="text-primary" />
              ) : (
                <Droplets size={20} className="text-accent" />
              )}
            </div>
            
            <div className="flex-1 min-w-0">
              <p className="font-medium text-foreground text-sm truncate">{item.drinkName}</p>
              <p className="text-xs text-muted-foreground truncate">{item.shopName}</p>
            </div>
            
            <p className="text-xs text-muted-foreground">{formatDate(item.redeemedAt)}</p>
          </div>
        ))}
      </div>
      
      {redemptions.length > 3 && (
        <Link 
          to="/history" 
          className="mt-3 card-interactive flex items-center justify-center gap-2 py-3 text-sm font-medium text-foreground"
        >
          Показать все ({redemptions.length})
          <ChevronRight size={16} />
        </Link>
      )}
    </div>
  );
}
