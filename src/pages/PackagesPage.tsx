import { useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { TabSwitcher } from '@/components/ui/TabSwitcher';
import { Sparkles, Coffee, Check } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { getPeriodText } from '@/utils/subscriptionDuration';
import { useActiveSubscription } from '@/hooks/useActiveSubscription';
import { queryKeys, prefetchSubscriptions } from '@/hooks/usePrefetch';
import { getSubscriptionBadgeStyle } from '@/components/admin/SubscriptionBadgeEditor';

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
  badge_color: string | null;
  benefit: number | null;
}

const tabs = [
  { id: 'coffee', label: 'Кофе' },
  { id: 'drinks', label: 'Напитки' },
];

const formatPrice = (price: number) => {
  return new Intl.NumberFormat('ru-RU').format(price);
};

const formatBenefit = (benefit: number) => {
  return new Intl.NumberFormat('ru-RU').format(benefit);
};

export default function PackagesPage() {
  const [activeTab, setActiveTab] = useState('coffee');
  const { activeSubscriptionTypeId } = useActiveSubscription();

  const { data: subscriptions = [], isLoading } = useQuery({
    queryKey: queryKeys.subscriptions,
    queryFn: prefetchSubscriptions,
    staleTime: 60 * 1000,
    gcTime: 5 * 60 * 1000,
  });

  const filteredSubscriptions = subscriptions.filter((s: SubscriptionType) => s.type === activeTab);

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
                const period = getPeriodText(sub.duration_days);
                const isActive = activeSubscriptionTypeId === sub.id;
                
                return (
                  <Link
                    key={sub.id}
                    to={`/packages/${sub.id}`}
                    className="block animate-slide-up"
                    style={{ animationDelay: `${index * 0.05}s` }}
                  >
                    <div className={`card-interactive relative overflow-hidden group ${isActive ? 'ring-2 ring-accent' : ''}`}>
                      {/* Background accent */}
                      <div className="absolute inset-0 bg-gradient-to-br from-accent/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                      
                      {/* Badge from database */}
                      {sub.badge && !isActive && (
                        <div className="absolute top-4 right-4">
                          <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold shadow-lg ${getSubscriptionBadgeStyle(sub.badge, sub.badge_color)}`}>
                            <Sparkles size={12} />
                            {sub.badge}
                          </span>
                        </div>
                      )}
                      
                      {/* Active badge */}
                      {isActive && (
                        <div className="absolute top-4 right-4">
                          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold text-white bg-accent shadow-lg">
                            <Check size={12} />
                            Активна
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
                        
                        {sub.benefit && sub.benefit > 0 && (
                          <div className="flex items-center gap-2 mt-1.5">
                            <span className="text-xs font-semibold text-accent">
                              Выгода {formatBenefit(sub.benefit)} ₸
                            </span>
                          </div>
                        )}
                      </div>
                      
                      {/* CTA Button */}
                      {isActive ? (
                        <div className="w-full py-3 px-6 rounded-xl text-sm font-semibold text-center bg-muted text-muted-foreground cursor-not-allowed">
                          Ваша активная подписка
                        </div>
                      ) : (
                        <button className="btn-primary w-full text-sm font-semibold">
                          Оформить
                        </button>
                      )}
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
