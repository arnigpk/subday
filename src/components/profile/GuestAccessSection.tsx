import { Link } from 'react-router-dom';
import { Gift, ChevronRight } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useSubscriptionStatus } from '@/hooks/useSubscriptionStatus';

export function GuestAccessSection() {
  const { t } = useLanguage();
  const { activeSubscriptions } = useSubscriptionStatus();
  const hasCoffeeSubscription = activeSubscriptions.some(s => s.subscription_type === 'coffee');

  if (!hasCoffeeSubscription) return null;

  return (
    <div className="space-y-2 animate-slide-up" style={{ animationDelay: '0.12s' }}>
      <h3 className="text-sm font-semibold text-muted-foreground px-1 mb-2">
        {t('guest.title')}
      </h3>

      <Link to="/gift-coffee" className="w-full card-interactive flex items-center gap-3">
        <Gift size={20} className="text-primary" />
        <div className="flex-1 min-w-0">
          <span className="font-medium text-foreground">{t('guest.inviteFriend')}</span>
          <p className="text-xs text-muted-foreground mt-0.5">{t('guest.giftSubtitle')}</p>
        </div>
        <ChevronRight size={18} className="text-muted-foreground" />
      </Link>
    </div>
  );
}
