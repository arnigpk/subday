import { useState, useEffect } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { TabSwitcher } from '@/components/ui/TabSwitcher';
import { Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';

interface SubscriptionType {
  id: string;
  name: string;
  description: string | null;
  type: string;
  cups_count: number;
  price: number;
  duration_days: number;
  is_active: boolean;
}

const tabs = [
  { id: 'coffee', label: 'Кофе' },
  { id: 'drinks', label: 'Напитки' },
];

const formatPrice = (price: number) => {
  return new Intl.NumberFormat('ru-RU').format(price) + ' тг';
};

const getBadge = (cupsCount: number): string | null => {
  if (cupsCount >= 300) return 'Максимум';
  if (cupsCount >= 40) return 'Выгодно';
  if (cupsCount >= 25) return 'Хит';
  return null;
};

const getPeriod = (days: number): string => {
  if (days >= 365) return 'год';
  if (days >= 30) return 'месяц';
  return `${days} дней`;
};

const getOriginalPrice = (cups: number, type: string): number => {
  const pricePerCup = type === 'coffee' ? 1500 : 1200;
  return cups * pricePerCup;
};

export default function PackagesPage() {
  const [activeTab, setActiveTab] = useState('coffee');
  const [subscriptions, setSubscriptions] = useState<SubscriptionType[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchSubscriptions();
  }, []);

  const fetchSubscriptions = async () => {
    try {
      const { data, error } = await supabase
        .from('subscription_types')
        .select('*')
        .eq('is_active', true)
        .order('price', { ascending: true });

      if (error) throw error;
      setSubscriptions(data || []);
    } catch (error) {
      console.error('Error fetching subscriptions:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const filteredSubscriptions = subscriptions.filter(s => s.type === activeTab);

  return (
    <AppLayout>
      <div className="safe-area-top">
        <div className="px-4 py-4">
          <h1 className="text-2xl font-black text-foreground mb-4">Подписки</h1>
          
          <TabSwitcher
            tabs={tabs}
            activeTab={activeTab}
            onChange={setActiveTab}
            className="mb-6"
          />
          
          {isLoading ? (
            <div className="space-y-4">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="card-base h-40 animate-pulse bg-muted" />
              ))}
            </div>
          ) : filteredSubscriptions.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground">Нет доступных подписок</p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredSubscriptions.map((sub, index) => {
                const badge = getBadge(sub.cups_count);
                const period = getPeriod(sub.duration_days);
                const originalPrice = getOriginalPrice(sub.cups_count, sub.type);
                
                return (
                  <Link
                    key={sub.id}
                    to={`/packages/${sub.id}`}
                    className="block animate-slide-up"
                    style={{ animationDelay: `${index * 0.05}s` }}
                  >
                    <div className="card-interactive relative overflow-hidden">
                      {badge && (
                        <div className="absolute top-3 right-3">
                          <span className="badge-accent flex items-center gap-1">
                            <Sparkles size={12} />
                            {badge}
                          </span>
                        </div>
                      )}
                      
                      <div className="pr-20">
                        <h3 className="text-xl font-bold text-foreground mb-1">
                          {sub.name}
                        </h3>
                        {sub.description && (
                          <p className="text-sm text-muted-foreground mb-3">
                            {sub.description}
                          </p>
                        )}
                        
                        <div className="flex items-baseline gap-2">
                          <span className="text-2xl font-black text-foreground">
                            {formatPrice(sub.price)}
                          </span>
                          <span className="text-sm text-muted-foreground">
                            /{period}
                          </span>
                          {originalPrice > sub.price && (
                            <span className="text-sm text-muted-foreground line-through">
                              {formatPrice(originalPrice)}
                            </span>
                          )}
                        </div>
                      </div>
                      
                      <div className="mt-4">
                        <button className="btn-primary w-full text-sm">
                          Оформить
                        </button>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}