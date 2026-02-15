import { useState, useCallback } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { PullToRefresh } from '@/components/layout/PullToRefresh';
import { TabSwitcher } from '@/components/ui/TabSwitcher';
import { Sparkles, Coffee, Check } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getPeriodText } from '@/utils/subscriptionDuration';
import { useActiveSubscription } from '@/hooks/useActiveSubscription';
import { queryKeys, prefetchSubscriptions } from '@/hooks/usePrefetch';
import { getSubscriptionBadgeStyle } from '@/components/admin/SubscriptionBadgeEditor';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAutoTranslate } from '@/hooks/useAutoTranslate';

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

const formatPrice = (price: number) => new Intl.NumberFormat('ru-RU').format(price);
const formatBenefit = (benefit: number) => new Intl.NumberFormat('ru-RU').format(benefit);

export default function PackagesPage() {
  const [activeTab, setActiveTab] = useState('coffee');
  const { activeSubscriptionTypeId, refetch: refetchSubscription } = useActiveSubscription();
  const queryClient = useQueryClient();
  const { t, language } = useLanguage();

  const tabs = [
    { id: 'coffee', label: t('balance.coffee') },
    { id: 'drinks', label: t('balance.drinks') },
  ];

  const { data: subscriptions = [], isLoading, refetch } = useQuery({
    queryKey: queryKeys.subscriptions,
    queryFn: prefetchSubscriptions,
    staleTime: 60 * 1000,
    gcTime: 5 * 60 * 1000,
  });

  const handleRefresh = useCallback(async () => {
    await Promise.all([refetch(), refetchSubscription()]);
  }, [refetch, refetchSubscription]);

  const filteredSubscriptions = subscriptions.filter((s: SubscriptionType) => s.type === activeTab);

  const daysWord = (days: number) => {
    if (language === 'kz') return 'күн';
    if (days === 1) return 'день';
    if (days >= 2 && days <= 4) return 'дня';
    if (days >= 5 && days <= 20) return 'дней';
    if (days % 10 === 1) return 'день';
    if (days % 10 >= 2 && days % 10 <= 4) return 'дня';
    return 'дней';
  };

  return (
    <AppLayout>
      <PullToRefresh onRefresh={handleRefresh}>
        <div className="safe-area-top">
          <div className="px-4 py-4">
            <div className="mb-5">
              <h1 className="text-2xl font-black text-foreground tracking-tight">{t('packages.title')}</h1>
              <p className="text-xs text-muted-foreground mt-1">{t('packages.subtitle')}</p>
            </div>
            
            <TabSwitcher tabs={tabs} activeTab={activeTab} onChange={setActiveTab} className="mb-6" />
            
            {isLoading ? (
              <div className="space-y-4">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="card-base h-48 animate-pulse bg-muted rounded-2xl" />
                ))}
              </div>
            ) : filteredSubscriptions.length === 0 ? (
              <div className="text-center py-12">
                <Coffee className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
                <p className="text-muted-foreground">{t('packages.noPackages')}</p>
              </div>
            ) : (
              <div className="space-y-4">
              {filteredSubscriptions.map((sub, index) => (
                <SubscriptionCard key={sub.id} sub={sub} index={index} activeSubscriptionTypeId={activeSubscriptionTypeId} t={t} language={language} daysWord={daysWord} />
              ))}
              </div>
            )}
          </div>
        </div>
      </PullToRefresh>
    </AppLayout>
  );
}

function SubscriptionCard({ sub, index, activeSubscriptionTypeId, t, language, daysWord }: {
  sub: SubscriptionType; index: number; activeSubscriptionTypeId: string | null;
  t: (key: string) => string; language: string; daysWord: (days: number) => string;
}) {
  const translatedName = useAutoTranslate(sub.name);
  const translatedDescription = useAutoTranslate(sub.description);
  const translatedBadge = sub.badge; // badges stay in original language
  
  const period = getPeriodText(sub.duration_days);
  const isActive = activeSubscriptionTypeId === sub.id;

  return (
    <Link
      to={`/packages/${sub.id}`}
      className="block animate-slide-up"
      style={{ animationDelay: `${index * 0.05}s` }}
    >
      <div className={`card-interactive relative overflow-hidden group ${isActive ? 'ring-2 ring-accent' : ''}`}>
        <div className="absolute inset-0 bg-gradient-to-br from-accent/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
        
        {sub.badge && !isActive && (
          <div className="absolute top-4 right-4">
            <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold shadow-lg ${getSubscriptionBadgeStyle(sub.badge, sub.badge_color)}`}>
              <Sparkles size={12} />
              {translatedBadge}
            </span>
          </div>
        )}
        
        {isActive && (
          <div className="absolute top-4 right-4">
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold text-white bg-accent shadow-lg">
              <Check size={12} />
              {t('packages.active')}
            </span>
          </div>
        )}
        
        <div className="relative">
          <div className="mb-3">
            <div className="flex items-center gap-2 mb-1">
              <Coffee size={14} className="text-accent" />
              <h3 className="text-lg font-bold text-foreground tracking-tight">{translatedName}</h3>
            </div>
            {sub.description && (
              <p className="text-xs text-muted-foreground leading-relaxed pl-5">{translatedDescription}</p>
            )}
            <div className="mt-2 pl-5">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-accent/10 text-accent text-xs font-semibold rounded-lg">
                ☕ {sub.cups_count} {t('packages.coffeeFor')} {sub.duration_days} {daysWord(sub.duration_days)}
              </span>
            </div>
          </div>
          
          <div className="mb-4">
            <div className="flex items-end gap-1.5">
              <span className="text-2xl font-black text-foreground tracking-tight">{formatPrice(sub.price)}</span>
              <span className="text-sm font-medium text-muted-foreground mb-0.5">тг</span>
              <span className="text-xs text-muted-foreground mb-0.5">/ {period}</span>
            </div>
          
            {sub.benefit && sub.benefit > 0 && (
              <div className="flex items-center gap-2 mt-1.5">
                <span className="text-xs font-semibold text-accent">{t('packages.benefit')} {formatBenefit(sub.benefit)} ₸</span>
              </div>
            )}
          </div>
          
          {isActive ? (
            <div className="w-full py-3 px-6 rounded-xl text-sm font-semibold text-center bg-muted text-muted-foreground cursor-not-allowed">
              {t('packages.yourActive')}
            </div>
          ) : (
            <button className="btn-primary w-full text-sm font-semibold">{t('packages.subscribe')}</button>
          )}
        </div>
      </div>
    </Link>
  );
}
