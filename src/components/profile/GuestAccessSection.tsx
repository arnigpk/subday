import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Gift, ChevronRight } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useLanguage } from '@/contexts/LanguageContext';
import { useSubscriptionStatus } from '@/hooks/useSubscriptionStatus';

export function GuestAccessSection() {
  const { t } = useLanguage();
  const [monthlyUsed, setMonthlyUsed] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const { activeSubscriptions } = useSubscriptionStatus();
  const hasCoffeeSubscription = activeSubscriptions.some(s => s.subscription_type === 'coffee');

  const fetchStatus = useCallback(async () => {
    try {
      const { data, error } = await supabase.functions.invoke('guest-access', {
        body: { action: 'status' },
      });
      if (!error && data) {
        setMonthlyUsed(data.monthlyUsed || false);
      }
    } catch (err) {
      console.error('Guest status error:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  if (!hasCoffeeSubscription) return null;

  return (
    <div className="space-y-2 animate-slide-up" style={{ animationDelay: '0.12s' }}>
      <h3 className="text-sm font-semibold text-muted-foreground px-1 mb-2">
        {t('guest.title')}
      </h3>

      {/* Monthly status */}
      <div className="card-static">
        <p className="text-sm text-muted-foreground">
          {isLoading ? '...' : monthlyUsed ? t('guest.usedThisMonth') : t('guest.availableThisMonth')}
        </p>
      </div>

      {/* Invite button */}
      {!monthlyUsed && (
        <Link
          to="/gift-coffee"
          className="w-full card-interactive flex items-center gap-3"
        >
          <Gift size={20} className="text-primary" />
          <span className="flex-1 font-medium text-foreground">{t('guest.inviteFriend')}</span>
          <ChevronRight size={18} className="text-muted-foreground" />
        </Link>
      )}
    </div>
  );
}
