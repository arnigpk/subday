import { useState } from 'react';
import { Coffee, Droplets, Clock, AlertTriangle, Gift } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { TabSwitcher } from '../ui/TabSwitcher';
import { useUserStatsContext } from '@/contexts/UserStatsContext';
import { useSubscriptionStatus } from '@/hooks/useSubscriptionStatus';
import { useDailyLimit } from '@/hooks/useDailyLimit';
import { Button } from '../ui/button';
import { useLanguage } from '@/contexts/LanguageContext';
import { getKzSuffix, formatDateKzWithYear } from '@/utils/kazakh';

export function BalanceCard() {
  const [activeTab, setActiveTab] = useState<'coffee' | 'drinks'>('coffee');
  const { stats, isLoading } = useUserStatsContext();
  const { daysRemaining, isExpiringSoon, activeSubscriptions } = useSubscriptionStatus();
  const { isLimitReached, dailyLimit, remainingToday, isLoading: isLimitLoading } = useDailyLimit(activeTab);
  const navigate = useNavigate();
  const { t, language } = useLanguage();
  
  const tabs = [
    { id: 'coffee', label: t('balance.coffee') },
    { id: 'drinks', label: t('balance.drinks') },
  ];

  const isCoffee = activeTab === 'coffee';
  const remaining = isCoffee ? stats.coffeeRemaining : stats.drinksRemaining;
  const total = isCoffee ? stats.coffeeTotal : stats.drinksTotal;
  const percentage = total > 0 ? (remaining / total) * 100 : 0;
  
  const currentTypeSub = activeSubscriptions.find(s => s.subscription_type === activeTab);
  const hasSubscription = !!currentTypeSub && total > 0 && remaining > 0;
  
  const formatDaysRemaining = (days: number | null) => {
    if (days === null) return null;
    if (days <= 0) return t('balance.expired');
    if (days >= 365) return t('balance.year');
    if (days >= 30) {
      const months = Math.floor(days / 30);
      return months === 1 ? `~1 ${t('balance.month1').replace('~1 ', '')}` : `~${months} ${t('balance.months')}`;
    }
    if (days === 1) return t('balance.day1');
    if (days >= 2 && days <= 4) return `${days} ${t('balance.days234')}`;
    return `${days} ${t('balance.days')}`;
  };
  
  if (isLoading) {
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
        onChange={(tab) => setActiveTab(tab as 'coffee' | 'drinks')}
        className="mb-4"
      />

      {/* Guest coffee banner - always visible regardless of subscription */}
      {stats.guestCoffees > 0 && stats.guestExpiresAt && new Date(stats.guestExpiresAt) > new Date() && (
        <div className="mb-3 flex items-center gap-2 px-3 py-2 rounded-xl bg-primary/10">
          <Gift size={14} className="text-primary" />
          <span className="text-xs font-medium text-primary">
            {language === 'kz' 
              ? `Қонақ кофе: ${stats.guestCoffees} (${new Date(stats.guestExpiresAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })} дейін)`
              : `Гостевой кофе: ${stats.guestCoffees} (до ${new Date(stats.guestExpiresAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })})`
            }
          </span>
        </div>
      )}
      
      {hasSubscription ? (
        <>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-4">
              <div className={`w-16 h-16 rounded-2xl flex items-center justify-center ${
                isCoffee ? 'bg-primary/10' : 'bg-accent/10'
              }`}>
                {isCoffee ? (
                  <Coffee size={32} className="text-primary" />
                ) : (
                  <Droplets size={32} className="text-accent" />
                )}
              </div>
              
              <div>
                <p className="text-muted-foreground text-sm font-medium">
                  {language === 'kz' 
                    ? `Жазылым бойынша ${total}-${getKzSuffix(total)} ${remaining} қалды`
                    : `${t('balance.remaining')} ${remaining} ${t('balance.of')} ${total}`
                  }
                </p>
                
                {!isLimitLoading && isLimitReached && (
                  <div className="flex items-center gap-1.5 mt-1.5 text-destructive">
                    <AlertTriangle size={14} />
                    <span className="text-xs font-medium">{t('balance.dailyLimitReached')}</span>
                  </div>
                )}

                {!isLimitLoading && dailyLimit && !isLimitReached && remainingToday !== null && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {t('balance.todayRemaining')} {remainingToday} {t('balance.of')} {dailyLimit}
                  </p>
                )}
              </div>
            </div>
            
            <div className="relative w-16 h-16">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                <path className="text-secondary" stroke="currentColor" strokeWidth="4" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                <path className={isCoffee ? 'text-primary' : 'text-accent'} stroke="currentColor" strokeWidth="4" strokeLinecap="round" fill="none" strokeDasharray={`${percentage}, 100`} d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-xs font-bold text-foreground">{Math.round(percentage)}%</span>
              </div>
            </div>
          </div>
          
          {currentTypeSub?.expires_at && daysRemaining !== null && (
            <div className={`mt-3 flex items-center gap-2 px-3 py-2 rounded-xl ${isExpiringSoon ? 'bg-destructive/10' : 'bg-secondary'}`}>
              <Clock size={14} className={isExpiringSoon ? 'text-destructive' : 'text-muted-foreground'} />
              <span className={`text-xs font-medium ${isExpiringSoon ? 'text-destructive' : 'text-muted-foreground'}`}>
                {t('balance.subscription')} {formatDaysRemaining(daysRemaining)}
                {currentTypeSub.expires_at && (
                  <span className="ml-1">
                    {language === 'kz' 
                      ? `(${formatDateKzWithYear(new Date(currentTypeSub.expires_at), daysRemaining > 30)} дейін)`
                      : `(до ${new Date(currentTypeSub.expires_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: daysRemaining > 30 ? 'numeric' : undefined })})`
                    }
                  </span>
                )}
              </span>
            </div>
          )}
        </>
      ) : (
        <div className="flex flex-col items-center justify-center py-4 gap-4">
          <div className={`w-16 h-16 rounded-2xl flex items-center justify-center ${isCoffee ? 'bg-primary/10' : 'bg-accent/10'}`}>
            {isCoffee ? <Coffee size={32} className="text-primary" /> : <Droplets size={32} className="text-accent" />}
          </div>
          <p className="text-muted-foreground text-sm font-medium text-center">{t('balance.noSubscription')}</p>
          <Button onClick={() => navigate('/packages')} className="w-full">{t('balance.subscribe')}</Button>
        </div>
      )}
    </div>
  );
}
