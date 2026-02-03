import { QrCode } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useSubscriptionStatus } from '@/hooks/useSubscriptionStatus';
import { useDailyLimit } from '@/hooks/useDailyLimit';
import { toast } from 'sonner';

export function GetCoffeeButton() {
  const navigate = useNavigate();
  const { hasActiveSubscription, isLoading } = useSubscriptionStatus();
  const { isLimitReached, isLoading: isLimitLoading } = useDailyLimit('coffee');

  const isDisabled = isLoading || isLimitLoading || isLimitReached;

  const handleClick = () => {
    if (isDisabled) return;
    
    if (!hasActiveSubscription) {
      toast.info('Пожалуйста, оформите подписку');
      navigate('/packages');
    } else {
      navigate('/redeem');
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
          !isLimitReached ? 'animate-pulse-glow' : ''
        }`}
      >
        <QrCode size={28} strokeWidth={2.5} />
        <span>{isLimitReached ? 'Лимит исчерпан' : 'Показать QR'}</span>
      </button>
    </div>
  );
}
