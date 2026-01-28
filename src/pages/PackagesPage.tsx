import { useState, useEffect } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { TabSwitcher } from '@/components/ui/TabSwitcher';
import { Sparkles, Coffee, Zap, Crown } from 'lucide-react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { getPeriodText } from '@/utils/subscriptionDuration';

interface SubscriptionType {
  id: string;
  name: string;
  description: string | null;
  type: string;
  cups_count: number;
  price: number;
  duration_days: number;
  is_active: boolean;
  badge: string | null;
}

const tabs = [
  { id: 'coffee', label: 'Кофе' },
  { id: 'drinks', label: 'Напитки' },
];

const formatPrice = (price: number) => {
  return new Intl.NumberFormat('ru-RU').format(price);
};

const getBadgeStyle = (badge: string | null): { icon: typeof Sparkles; gradient: string } | null => {
  if (!badge) return null;
  
  switch (badge) {
    case 'Максимум':
      return { icon: Crown, gradient: 'from-amber-500 to-orange-500' };
    case 'Выгодно':
      return { icon: Zap, gradient: 'from-accent to-lime-500' };
    case 'Хит':
      return { icon: Sparkles, gradient: 'from-accent to-emerald-500' };
    case 'Новинка':
      return { icon: Sparkles, gradient: 'from-blue-500 to-cyan-500' };
    default:
      return { icon: Sparkles, gradient: 'from-accent to-primary' };
  }
};

const getOriginalPrice = (cups: number, type: string): number => {
  const pricePerCup = type === 'coffee' ? 1500 : 1200;
  return cups * pricePerCup;
};

const getSavingsPercent = (original: number, current: number): number => {
  return Math.round(((original - current) / original) * 100);
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
        .order('sort_order', { ascending: true });

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
          <div className="mb-5">
            <h1 className="text-2xl font-black text-foreground tracking-tight">Подписки</h1>
            <p className="text-xs text-muted-foreground mt-1">Выбери свой идеальный план</p>
          </div>
          
          <TabSwitcher
            tabs={tabs}
            activeTab={activeTab}
            onChange={setActiveTab}
            className="mb-6"
          />
          
          {isLoading ? (
            <div className="space-y-4">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="card-base h-48 animate-pulse bg-muted rounded-2xl" />
              ))}
            </div>
          ) : filteredSubscriptions.length === 0 ? (
            <div className="text-center py-12">
              <Coffee className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
              <p className="text-muted-foreground">Нет доступных подписок</p>
            </div>
          ) : (
            <div className="space-y-4">
            {filteredSubscriptions.map((sub, index) => {
                const badgeStyle = getBadgeStyle(sub.badge);
                const period = getPeriodText(sub.duration_days);
                const originalPrice = getOriginalPrice(sub.cups_count, sub.type);
                const savingsPercent = getSavingsPercent(originalPrice, sub.price);
                const BadgeIcon = badgeStyle?.icon || Sparkles;
                
                return (
                  <Link
                    key={sub.id}
                    to={`/packages/${sub.id}`}
                    className="block animate-slide-up"
                    style={{ animationDelay: `${index * 0.05}s` }}
                  >
                    <div className="card-interactive relative overflow-hidden group">
                      {/* Background accent */}
                      <div className="absolute inset-0 bg-gradient-to-br from-accent/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                      
                      {/* Badge from database */}
                      {sub.badge && badgeStyle && (
                        <div className="absolute top-4 right-4">
                          <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold text-white bg-gradient-to-r ${badgeStyle.gradient} shadow-lg`}>
                            <BadgeIcon size={12} />
                            {sub.badge}
                          </span>
                        </div>
                      )}
                      
                      <div className="relative">
                        {/* Title section */}
                        <div className="mb-3">
                          <div className="flex items-center gap-2 mb-1">
                            <Coffee size={14} className="text-accent" />
                            <h3 className="text-lg font-bold text-foreground tracking-tight">
                              {sub.name}
                            </h3>
                          </div>
                          {sub.description && (
                            <p className="text-xs text-muted-foreground leading-relaxed pl-5">
                              {sub.description}
                            </p>
                          )}
                        </div>
                        
                        {/* Price section */}
                        <div className="mb-4">
                          <div className="flex items-end gap-1.5">
                            <span className="text-2xl font-black text-foreground tracking-tight">
                              {formatPrice(sub.price)}
                            </span>
                            <span className="text-sm font-medium text-muted-foreground mb-0.5">
                              тг
                            </span>
                            <span className="text-xs text-muted-foreground mb-0.5">
                              / {period}
                            </span>
                          </div>
                          
                          {originalPrice > sub.price && (
                            <div className="flex items-center gap-2 mt-1.5">
                              <span className="text-xs text-muted-foreground line-through decoration-destructive/50">
                                {formatPrice(originalPrice)} тг
                              </span>
                              <span className="text-[10px] font-bold text-accent bg-accent/10 px-1.5 py-0.5 rounded-full">
                                −{savingsPercent}%
                              </span>
                            </div>
                          )}
                        </div>
                        
                        {/* CTA Button */}
                        <button className="btn-primary w-full text-sm font-semibold">
                          Оформить
                        </button>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
          
          {/* Bottom info */}
          <div className="mt-6 text-center">
            <p className="text-xs text-muted-foreground">
              Отмена подписки в любой момент
            </p>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
