import { useState, useCallback } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { PullToRefresh } from '@/components/layout/PullToRefresh';
import { LiquidGlassHeader } from '@/components/layout/LiquidGlassHeader';
import { TabSwitcher } from '@/components/ui/TabSwitcher';
import { Sparkles, Coffee, Check, UtensilsCrossed, Gift } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getPeriodText } from '@/utils/subscriptionDuration';
import { calcDaysRemaining, formatSubscriptionExpiry } from '@/utils/formatSubscriptionDays';
import { useActiveSubscription } from '@/hooks/useActiveSubscription';
import { queryKeys, prefetchSubscriptions } from '@/hooks/usePrefetch';
import { getSubscriptionBadgeStyle } from '@/components/admin/SubscriptionBadgeEditor';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAutoTranslate } from '@/hooks/useAutoTranslate';
import { useSpecialOffer } from '@/hooks/useSpecialOffer';
import { useUserStatsContext } from '@/contexts/UserStatsContext';
import { getCurrencySymbol } from '@/utils/countries';

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
  const { activeSubscriptionTypeIds, refetch: refetchSubscription } = useActiveSubscription();
  const queryClient = useQueryClient();
  const { t, language } = useLanguage();
  const { eligibleOffers } = useSpecialOffer();
  const { profile } = useUserStatsContext();
  const userCountry = profile?.country || 'KZ';
  const currencySymbol = getCurrencySymbol(userCountry);

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

  const filteredSubscriptions = subscriptions.filter((s: SubscriptionType) => s.type === activeTab && (!((s as any).country) || (s as any).country === userCountry));

  // Build a map of subscription_type_id -> eligible offer(s)
  const offerMap = new Map<string, typeof eligibleOffers[0]>();
  for (const eo of eligibleOffers) {
    if (!offerMap.has(eo.offer.target_subscription_type_id)) {
      offerMap.set(eo.offer.target_subscription_type_id, eo);
    }
  }

  // Sort: subscriptions with special offers first
  const sortedSubscriptions = [...filteredSubscriptions].sort((a: SubscriptionType, b: SubscriptionType) => {
    const aHasOffer = offerMap.has(a.id) && !activeSubscriptionTypeIds.includes(a.id);
    const bHasOffer = offerMap.has(b.id) && !activeSubscriptionTypeIds.includes(b.id);
    if (aHasOffer && !bHasOffer) return -1;
    if (!aHasOffer && bHasOffer) return 1;
    return 0;
  });

  const daysWord = (days: number) => {
    if (language === 'kz' || language === 'kg') return 'күн';
    if (language === 'en') return days === 1 ? 'day' : 'days';
    if (language === 'uz') return 'kun';
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
        <div>
          <LiquidGlassHeader>
            <div className="px-4 py-4">
              <div className="mb-0">
                <h1 className="text-2xl font-black text-foreground tracking-tight">{t('packages.title')}</h1>
                <p className="text-xs text-muted-foreground mt-1">{t('packages.subtitle')}</p>
              </div>
            </div>
          </LiquidGlassHeader>
          <div className="px-4 pt-4">
            
            <TabSwitcher tabs={tabs} activeTab={activeTab} onChange={setActiveTab} className="mb-6" />
            
            {isLoading ? (
              <div className="space-y-4">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="card-base h-48 animate-pulse bg-muted rounded-2xl" />
                ))}
              </div>
            ) : sortedSubscriptions.length === 0 ? (
              <div className="text-center py-12">
                <Coffee className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
                <p className="text-muted-foreground">{t('packages.noPackages')}</p>
              </div>
            ) : (
              <div className="space-y-4">
              {sortedSubscriptions.map((sub, index) => {
                const eo = offerMap.get(sub.id);
                return (
                  <SubscriptionCard
                    key={sub.id}
                    sub={sub}
                    index={index}
                    activeSubscriptionTypeIds={activeSubscriptionTypeIds}
                    t={t}
                    language={language}
                    daysWord={daysWord}
                    currencySymbol={((sub as any).currency as string) || currencySymbol}
                    specialOffer={eo && !activeSubscriptionTypeIds.includes(sub.id) ? eo.offer : null}
                    eligibleUntil={eo?.eligibleUntil}
                  />
                );
              })}
              </div>
            )}
          </div>
        </div>
      </PullToRefresh>
    </AppLayout>
  );
}

function SubscriptionCard({ sub, index, activeSubscriptionTypeIds, t, language, daysWord, currencySymbol, specialOffer, eligibleUntil }: {
  sub: SubscriptionType; index: number; activeSubscriptionTypeIds: string[];
  t: (key: string) => string; language: string; daysWord: (days: number) => string;
  currencySymbol: string;
  specialOffer?: { offer_price: number; offer_cups_count: number; offer_duration_days: number; badge_text: string | null } | null;
  eligibleUntil?: Date | null;
}) {
  const translatedName = useAutoTranslate(sub.name);
  const translatedDescription = useAutoTranslate(sub.description);
  const translatedBadge = sub.badge;
  
  const hasOffer = !!specialOffer;
  const displayPrice = hasOffer ? specialOffer!.offer_price : sub.price;
  const displayCups = hasOffer ? specialOffer!.offer_cups_count : sub.cups_count;
  const displayDays = hasOffer ? specialOffer!.offer_duration_days : sub.duration_days;

  const period = getPeriodText(displayDays, language);
  const isActive = activeSubscriptionTypeIds.includes(sub.id);
  const isLunch = sub.type === 'drinks';

  const formatDate = (d: Date) => d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });

  return (
    <Link
      to={`/packages/${sub.id}`}
      className="block animate-slide-up"
      style={{ animationDelay: `${index * 0.05}s` }}
    >
      <div className={`card-interactive relative overflow-hidden group ${isActive ? 'ring-2 ring-accent' : ''} ${hasOffer ? 'ring-2 ring-accent/50' : ''}`}>
        <div className="absolute inset-0 bg-gradient-to-br from-accent/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
        
        {hasOffer && !isActive && (
          <div className="absolute top-4 right-4">
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold text-white bg-accent shadow-lg animate-pulse">
              <Gift size={12} />
              {specialOffer!.badge_text || '-50%'}
            </span>
          </div>
        )}

        {!hasOffer && sub.badge && !isActive && (
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
              {isLunch ? (
                <UtensilsCrossed size={14} className="text-accent" />
              ) : (
                <Coffee size={14} className="text-accent" />
              )}
              <h3 className="text-lg font-bold text-foreground tracking-tight">{translatedName}</h3>
            </div>
            {sub.description && (
              <p className="text-xs text-muted-foreground leading-relaxed pl-5">{translatedDescription}</p>
            )}
            <div className="mt-2 pl-5">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-accent/10 text-accent text-xs font-semibold rounded-lg">
                {isLunch ? '🍽' : '☕'} {(language === 'kz' || language === 'kg')
                  ? `${displayDays} ${daysWord(displayDays)}ге ${displayCups} ${isLunch ? 'ланч' : 'кофе'}`
                  : language === 'en'
                  ? `${displayCups} ${isLunch ? 'lunches' : 'coffees'} for ${displayDays} ${daysWord(displayDays)}`
                  : language === 'uz'
                  ? `${displayDays} ${daysWord(displayDays)}ga ${displayCups} ${isLunch ? 'tushlik' : 'qahva'}`
                  : `${displayCups} ${isLunch ? 'ланчей на' : t('packages.coffeeFor')} ${displayDays} ${daysWord(displayDays)}`
                }
              </span>
            </div>
            {hasOffer && (
              <p className="text-xs text-accent font-medium pl-5 mt-1">
                {eligibleUntil
                  ? `⏰ Спецпредложение действует до ${formatDate(eligibleUntil)}`
                  : '⏰ Спецпредложение активно'}
              </p>
            )}
          </div>
          
          <div className="mb-4">
            <div className="flex items-end gap-1.5">
              <span className="text-2xl font-black text-foreground tracking-tight">{formatPrice(displayPrice)}</span>
              <span className="text-sm font-medium text-muted-foreground mb-0.5">{currencySymbol}</span>
              <span className="text-xs text-muted-foreground mb-0.5">/ {period}</span>
            </div>
            {hasOffer && (
              <div className="flex items-center gap-2 mt-1">
                <span className="text-sm text-muted-foreground line-through">{formatPrice(sub.price)} {currencySymbol}</span>
              </div>
            )}
            {!hasOffer && sub.benefit && sub.benefit > 0 && (
              <div className="flex items-center gap-2 mt-1.5">
                <span className="text-xs font-semibold text-accent">{formatBenefit(sub.benefit)} {currencySymbol} {sub.type === 'coffee' ? t('packages.benefitCoffee') : t('packages.benefitDrinks')}</span>
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
