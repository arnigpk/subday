import { AppLayout } from '@/components/layout/AppLayout';
import { Coffee, Droplets } from 'lucide-react';
import { useUserStatsContext } from '@/contexts/UserStatsContext';
import { format, parseISO } from 'date-fns';
import { ru } from 'date-fns/locale';

export default function HistoryPage() {
  const { redemptions, isLoading } = useUserStatsContext();
  
  const formatDate = (dateStr: string) => {
    try {
      const date = parseISO(dateStr);
      return format(date, 'd MMM', { locale: ru });
    } catch {
      return dateStr;
    }
  };
  
  const formatTime = (dateStr: string) => {
    try {
      const date = parseISO(dateStr);
      return format(date, 'HH:mm');
    } catch {
      return '';
    }
  };
  
  if (isLoading) {
    return (
      <AppLayout>
        <div className="safe-area-top">
          <div className="px-4 py-4">
            <h1 className="text-2xl font-black text-foreground mb-4">История</h1>
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="card-static flex items-center gap-4 animate-pulse">
                  <div className="w-12 h-12 rounded-xl bg-muted" />
                  <div className="flex-1">
                    <div className="h-4 w-24 bg-muted rounded mb-2" />
                    <div className="h-3 w-32 bg-muted rounded" />
                  </div>
                  <div className="text-right">
                    <div className="h-3 w-12 bg-muted rounded mb-2" />
                    <div className="h-3 w-10 bg-muted rounded" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </AppLayout>
    );
  }
  
  return (
    <AppLayout>
      <div className="safe-area-top">
        <div className="px-4 py-4">
          <h1 className="text-2xl font-black text-foreground mb-4">История</h1>
          
          {redemptions.length > 0 ? (
            <div className="space-y-3">
              {redemptions.map((item, index) => (
                <div 
                  key={item.id} 
                  className="card-static flex items-center gap-4 animate-slide-up"
                  style={{ animationDelay: `${index * 0.05}s` }}
                >
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                    item.drinkType === 'coffee' ? 'bg-primary/10' : 'bg-accent/10'
                  }`}>
                    {item.drinkType === 'coffee' ? (
                      <Coffee size={24} className="text-primary" />
                    ) : (
                      <Droplets size={24} className="text-accent" />
                    )}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-foreground truncate">{item.drinkName}</p>
                    <p className="text-sm text-muted-foreground truncate">{item.shopName}</p>
                  </div>
                  
                  <div className="text-right">
                    <p className="text-sm font-medium text-foreground">{formatDate(item.redeemedAt)}</p>
                    <p className="text-xs text-muted-foreground">{formatTime(item.redeemedAt)}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <div className="text-4xl mb-4">📋</div>
              <p className="text-lg font-semibold text-foreground mb-2">Пока пусто</p>
              <p className="text-sm text-muted-foreground">Забирай напитки — тут появится история</p>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
