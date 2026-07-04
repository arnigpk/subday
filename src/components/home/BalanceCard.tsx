import { useState, useEffect, useRef } from 'react';
import { Coffee, UtensilsCrossed, Clock, Gift } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { TabSwitcher } from '../ui/TabSwitcher';
import { useUserStatsContext } from '@/contexts/UserStatsContext';
import { useSubscriptionStatus } from '@/hooks/useSubscriptionStatus';
import { useDailyLimit } from '@/hooks/useDailyLimit';
import { Button } from '../ui/button';
import { useLanguage } from '@/contexts/LanguageContext';
import { getKzSuffix } from '@/utils/kazakh';
import { formatSubscriptionExpiry, calcDaysRemaining } from '@/utils/formatSubscriptionDays';

interface BalanceCardProps {
  activeTab: 'coffee' | 'drinks';
  onTabChange: (tab: 'coffee' | 'drinks') => void;
}

export function BalanceCard({ activeTab, onTabChange }: BalanceCardProps) {
  const { stats, isLoading } = useUserStatsContext();
  const { daysRemaining, isExpiringSoon, activeSubscriptions, isLoading: isSubLoading } = useSubscriptionStatus();
  const navigate = useNavigate();
  const { t, language } = useLanguage();
  
  const coffeeSub = activeSubscriptions.find(s => s.subscription_type === 'coffee');
  const lunchSub = activeSubscriptions.find(s => s.subscription_type === 'drinks');
  const hasLunchOnly = !!lunchSub && !coffeeSub;
  
  const hasSetDefault = useRef(false);
  
  useEffect(() => {
    if (!hasSetDefault.current && activeSubscriptions.length > 0) {
      hasSetDefault.current = true;
      if (hasLunchOnly) {
        onTabChange('drinks');
      }
    }
  }, [activeSubscriptions, hasLunchOnly, onTabChange]);
  
  const { isLimitReached, dailyLimit, remainingToday, isLoading: isLimitLoading } = useDailyLimit(activeTab);
  
  const tabs = hasLunchOnly
    ? [
        { id: 'drinks', label: t('balance.drinks') },
        { id: 'coffee', label: t('balance.coffee') },
      ]
    : [
        { id: 'coffee', label: t('balance.coffee') },
        { id: 'drinks', label: t('balance.drinks') },
      ];

  const isCoffee = activeTab === 'coffee';
  const remaining = isCoffee ? stats.coffeeRemaining : stats.drinksRemaining;
  const total = isCoffee ? stats.coffeeTotal : stats.drinksTotal;
  const percentage = total > 0 ? (remaining / total) * 100 : 0;
  
  const currentTypeSub = activeSubscriptions.find(s => s.subscription_type === activeTab);
  const hasSubscription = !!currentTypeSub && total > 0 && remaining > 0;
  
  const typeDaysRemaining = currentTypeSub?.expires_at ? calcDaysRemaining(currentTypeSub.expires_at) : null;
  const typeIsExpiringSoon = typeDaysRemaining !== null && typeDaysRemaining <= 7 && typeDaysRemaining > 0;

  const formatRemainingText = () => {
    if (language === 'kz') {
      return `Жазылым бойынша ${total}-${getKzSuffix(total)} ${remaining} қалды`;
    }
    return `${t('balance.remaining')} ${remaining} ${t('balance.of')} ${total}`;
  };

  const formatDailyAvailable = () => {
    if (language === 'kz') return `Бүгін ${remainingToday ?? 0} / ${dailyLimit} қолжетімді`;
    if (language === 'en') return `Available today ${remainingToday ?? 0} of ${dailyLimit}`;
    if (language === 'uz') return `Bugun ${remainingToday ?? 0} / ${dailyLimit} mavjud`;
    if (language === 'kg') return `Бүгүн ${remainingToday ?? 0} / ${dailyLimit} жеткиликтүү`;
    return `Сегодня доступно ${remainingToday ?? 0} из ${dailyLimit}`;
  };

  const formatGuestCoffee = () => {
    const dateStr = new Date(stats.guestExpiresAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
    return `${t('balance.guestCoffee')} ${stats.guestCoffees} (${t('balance.until')} ${dateStr})`;
  };
  
  // Пока грузятся И статистика, И подписки — показываем скелетон, а НЕ «нет подписки».
  // Иначе у пользователя с подпиской мелькало ложное «У вас нет подписки».
  // Подписки кешируются (1 мин), поэтому при повторных заходах скелетона почти нет.
  if (isLoading || isSubLoading) {
    return (
      <div className="card-static animate-slide-up">
        <div className="animate-pulse">
          <div className="h-10 bg-muted rounded-xl mb-4" />
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-2xl bg-muted" />
              <div>
                <div className="h-4 w-16 bg-muted rounded mb-2" />
                <div className="h-10 w-24 bg-muted rounded" />
              </div>
            </div>
            <div className="w-16 h-16 rounded-full bg-muted" />
          </div>
        </div>
      </div>
    );
  }
  
  return (
    <div className="card-static animate-slide-up">
      <TabSwitcher
        tabs={tabs}
        activeTab={activeTab}
        onChange={(tab) => onTabChange(tab as 'coffee' | 'drinks')}
        className="mb-4"
      />

      {stats.guestCoffees > 0 && stats.guestExpiresAt && new Date(stats.guestExpiresAt) > new Date() && (
        <div className="mb-3 flex items-center gap-2 px-3 py-2 rounded-xl bg-primary/10">
          <Gift size={14} className="text-primary" />
          <span className="text-xs font-medium text-primary">
            {formatGuestCoffee()}
          </span>
        </div>
      )}
      
      {hasSubscription ? (
        <>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div className="shrink-0" style={{ width: 48, height: 48 }}>
                <div className={`w-full h-full rounded-2xl flex items-center justify-center ${
                  isCoffee ? 'bg-primary/10' : 'bg-accent/10'
                }`}>
                  {isCoffee ? (
                    <Coffee size={24} className="text-primary" />
                  ) : (
                    <UtensilsCrossed size={24} className="text-accent" />
                  )}
                </div>
              </div>
              
              <div className="min-w-0 flex-1">
                <p className="text-muted-foreground text-sm font-medium leading-tight">
                  {formatRemainingText()}
                </p>
                
                {dailyLimit === null && !isLimitLoading ? (
                  <p className="text-[11px] text-primary font-medium mt-0.5 leading-tight">
                    {t('balance.unlimitedDaily')}
                  </p>
                ) : dailyLimit !== null && (
                  <p className={`text-[11px] font-medium mt-0.5 leading-tight ${isLimitReached ? 'text-destructive' : 'text-muted-foreground'}`}>
                    {formatDailyAvailable()}
                  </p>
                )}
              </div>
            </div>
            
            <div className="relative shrink-0" style={{ width: 64, height: 64 }}>
              <svg className="-rotate-90" width="64" height="64" viewBox="0 0 36 36">
                <path className="text-secondary" stroke="currentColor" strokeWidth="4" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                <path className={isCoffee ? 'text-primary' : 'text-accent'} stroke="currentColor" strokeWidth="4" strokeLinecap="round" fill="none" strokeDasharray={`${percentage}, 100`} d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-xs font-bold text-foreground whitespace-nowrap">{Math.round(percentage)}%</span>
              </div>
            </div>
          </div>
          
          {currentTypeSub?.expires_at && typeDaysRemaining !== null && (
            <div className={`mt-3 flex items-center gap-2 px-3 py-2 rounded-xl ${typeIsExpiringSoon ? 'bg-destructive/10' : 'bg-secondary'}`}>
              <Clock size={14} className={typeIsExpiringSoon ? 'text-destructive' : 'text-muted-foreground'} />
              <span className={`text-xs font-medium ${typeIsExpiringSoon ? 'text-destructive' : 'text-muted-foreground'}`}>
                {t('balance.subscription')}{' '}
                {formatSubscriptionExpiry(typeDaysRemaining, currentTypeSub.expires_at, language, t('balance.expired'))}
              </span>
            </div>
          )}
        </>
      ) : (
        <div className="flex flex-col items-center justify-center py-4 gap-4">
          <div className={`w-16 h-16 rounded-2xl flex items-center justify-center ${isCoffee ? 'bg-primary/10' : 'bg-accent/10'}`}>
            {isCoffee ? <Coffee size={32} className="text-primary" /> : <UtensilsCrossed size={32} className="text-accent" />}
          </div>
          <p className="text-muted-foreground text-sm font-medium text-center">{t('balance.noSubscription')}</p>
          <Button onClick={() => navigate('/packages')} className="w-full">{t('balance.subscribe')}</Button>
        </div>
      )}
    </div>
  );
}
