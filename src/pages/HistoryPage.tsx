import { AppLayout } from '@/components/layout/AppLayout';
import { historyItems } from '@/data/mockData';
import { Coffee, Droplets } from 'lucide-react';

export default function HistoryPage() {
  return (
    <AppLayout>
      <div className="safe-area-top">
        <div className="px-4 py-4">
          <h1 className="text-2xl font-black text-foreground mb-4">История</h1>
          
          {historyItems.length > 0 ? (
            <div className="space-y-3">
              {historyItems.map((item, index) => (
                <div 
                  key={item.id} 
                  className="card-static flex items-center gap-4 animate-slide-up"
                  style={{ animationDelay: `${index * 0.05}s` }}
                >
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                    item.type === 'coffee' ? 'bg-primary/10' : 'bg-accent/10'
                  }`}>
                    {item.type === 'coffee' ? (
                      <Coffee size={24} className="text-primary" />
                    ) : (
                      <Droplets size={24} className="text-accent" />
                    )}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-foreground truncate">{item.drink}</p>
                    <p className="text-sm text-muted-foreground truncate">{item.coffeeShop}</p>
                  </div>
                  
                  <div className="text-right">
                    <p className="text-sm font-medium text-foreground">{item.date}</p>
                    <p className="text-xs text-muted-foreground">{item.time}</p>
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
