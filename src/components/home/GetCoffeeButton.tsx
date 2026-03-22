import { QrCode } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useSubscriptionStatus } from '@/hooks/useSubscriptionStatus';
import { useDailyLimit } from '@/hooks/useDailyLimit';
import { useUserStatsContext } from '@/contexts/UserStatsContext';
import { toast } from 'sonner';
import { useLanguage } from '@/contexts/LanguageContext';

interface GetCoffeeButtonProps {
  activeTab: 'coffee' | 'drinks';
}

export function GetCoffeeButton({ activeTab }: GetCoffeeButtonProps) {
  const navigate = useNavigate();
  const { hasActiveSubscription, isLoading, activeSubscriptions } = useSubscriptionStatus();
  const { isLimitReached, isLoading: isLimitLoading } = useDailyLimit(activeTab);
  const { stats } = useUserStatsContext();
  const { t } = useLanguage();

  const hasGuestCoffee = stats.guestCoffees > 0 && stats.guestExpiresAt && new Date(stats.guestExpiresAt) > new Date();
  
  // Check if user has active subscription for the current tab type
  const hasActiveSubForType = activeSubscriptions.some(s => s.subscription_type === activeTab);
  
  const isDisabled = isLoading || isLimitLoading || (isLimitReached && !hasGuestCoffee) || (!hasActiveSubForType && !hasGuestCoffee);

  const handleClick = () => {
    if (isDisabled) return;
    
    if (hasGuestCoffee && activeTab === 'coffee') {
      navigate('/redeem', { state: { drinkType: 'coffee', drinkName: 'Кофе', isGuestCoffee: true } });
    } else if (!hasActiveSubForType) {
      toast.info(t('home.pleaseSubscribe'));
      navigate('/packages');
    } else {
      navigate('/redeem', { state: { drinkType: activeTab } });
    }
  };

  return (
    <div 
      className="block w-full animate-slide-up" 
      style={{ animationDelay: '0.05s' }}
    >
      <button 
        onClick={handleClick}
        disabled={isDisabled}
        className={`w-full btn-accent flex items-center justify-center gap-3 text-xl disabled:opacity-50 disabled:cursor-not-allowed ${
          !isLimitReached || hasGuestCoffee ? 'animate-pulse-glow' : ''
        }`}
      >
        <QrCode size={28} strokeWidth={2.5} />
        <span>{t('home.showQR')}</span>
      </button>
    </div>
  );
}
