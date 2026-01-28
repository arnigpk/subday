import { useState } from 'react';
import { Coffee, Droplets, Clock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { TabSwitcher } from '../ui/TabSwitcher';
import { useUserStatsContext } from '@/contexts/UserStatsContext';
import { useSubscriptionStatus } from '@/hooks/useSubscriptionStatus';
import { Button } from '../ui/button';

const tabs = [
  { id: 'coffee', label: 'Кофе' },
  { id: 'drinks', label: 'Напитки' },
];

export function BalanceCard() {
  const [activeTab, setActiveTab] = useState('coffee');
  const { stats, isLoading } = useUserStatsContext();
  const { daysRemaining, isExpiringSoon, activeSubscriptions } = useSubscriptionStatus();
  const navigate = useNavigate();
  
  const isCoffee = activeTab === 'coffee';
  const remaining = isCoffee ? stats.coffeeRemaining : stats.drinksRemaining;
  const total = isCoffee ? stats.coffeeTotal : stats.drinksTotal;
  const percentage = total > 0 ? (remaining / total) * 100 : 0;
  
  // Find active subscription for current type
  const currentTypeSub = activeSubscriptions.find(s => 
    s.subscription_type === activeTab
  );
  
  // Check if user has any subscription for current type AND has remaining cups
  // If remaining is 0, treat it as no subscription
  const hasSubscription = !!currentTypeSub && total > 0 && remaining > 0;
  
  const formatDaysRemaining = (days: number | null) => {
    if (days === null) return null;
    if (days <= 0) return 'Истекла';
    if (days >= 365) return '~1 год';
    if (days >= 30) {
      const months = Math.floor(days / 30);
      return months === 1 ? '~1 месяц' : `~${months} мес.`;
    }
    if (days === 1) return '1 день';
    if (days >= 2 && days <= 4) return `${days} дня`;
    return `${days} дней`;
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
        onChange={setActiveTab}
        className="mb-4"
      />
      
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
                <p className="text-muted-foreground text-sm font-medium">По подписке осталось {remaining} из {total}</p>
              </div>
            </div>
            
            {/* Progress ring */}
            <div className="relative w-16 h-16">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                <path
                  className="text-secondary"
                  stroke="currentColor"
                  strokeWidth="4"
                  fill="none"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
                <path
                  className={isCoffee ? 'text-primary' : 'text-accent'}
                  stroke="currentColor"
                  strokeWidth="4"
                  strokeLinecap="round"
                  fill="none"
                  strokeDasharray={`${percentage}, 100`}
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-xs font-bold text-foreground">
                  {Math.round(percentage)}%
                </span>
              </div>
            </div>
          </div>
          
          {/* Subscription expiry info */}
          {currentTypeSub?.expires_at && daysRemaining !== null && (
            <div className={`mt-3 flex items-center gap-2 px-3 py-2 rounded-xl ${
              isExpiringSoon ? 'bg-destructive/10' : 'bg-secondary'
            }`}>
              <Clock size={14} className={isExpiringSoon ? 'text-destructive' : 'text-muted-foreground'} />
              <span className={`text-xs font-medium ${
                isExpiringSoon ? 'text-destructive' : 'text-muted-foreground'
              }`}>
                Подписка: {formatDaysRemaining(daysRemaining)}
                {currentTypeSub.expires_at && (
                  <span className="ml-1">
                    (до {new Date(currentTypeSub.expires_at).toLocaleDateString('ru-RU', { 
                      day: 'numeric', 
                      month: 'short',
                      year: daysRemaining > 30 ? 'numeric' : undefined
                    })})
                  </span>
                )}
              </span>
            </div>
          )}
        </>
      ) : (
        <div className="flex flex-col items-center justify-center py-4 gap-4">
          <div className={`w-16 h-16 rounded-2xl flex items-center justify-center ${
            isCoffee ? 'bg-primary/10' : 'bg-accent/10'
          }`}>
            {isCoffee ? (
              <Coffee size={32} className="text-primary" />
            ) : (
              <Droplets size={32} className="text-accent" />
            )}
          </div>
          
          <p className="text-muted-foreground text-sm font-medium text-center">
            У вас нет подписки 😢
          </p>
          
          <Button 
            onClick={() => navigate('/packages')}
            className="w-full"
          >
            Оформить подписку
          </Button>
        </div>
      )}
    </div>
  );
}
