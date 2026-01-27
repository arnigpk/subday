import { QrCode } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useSubscriptionStatus } from '@/hooks/useSubscriptionStatus';
import { toast } from 'sonner';

export function GetCoffeeButton() {
  const navigate = useNavigate();
  const { hasActiveSubscription, isLoading } = useSubscriptionStatus();

  const handleClick = () => {
    if (isLoading) return;
    
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
        disabled={isLoading}
        className="w-full btn-accent flex items-center justify-center gap-3 text-xl animate-pulse-glow disabled:opacity-50"
      >
        <QrCode size={28} strokeWidth={2.5} />
        <span>Взять кофе</span>
      </button>
    </div>
  );
}
