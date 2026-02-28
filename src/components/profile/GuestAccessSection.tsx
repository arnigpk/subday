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
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setIsLoading(false); return; }

      // Direct DB query - much faster than edge function
      const now = new Date();
      const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
      
      const { data, error } = await supabase
        .from('guest_grants')
        .select('id')
        .eq('inviter_user_id', user.id)
        .eq('month_key', monthKey)
        .limit(1);
      
      if (!error) {
        setMonthlyUsed((data?.length ?? 0) > 0);
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

      <div className="card-static">
        <p className="text-sm text-muted-foreground">
          {isLoading ? '...' : monthlyUsed ? t('guest.usedThisMonth') : t('guest.availableThisMonth')}
        </p>
      </div>

      {!monthlyUsed && (
        <Link to="/gift-coffee" className="w-full card-interactive flex items-center gap-3">
          <Gift size={20} className="text-primary" />
          <span className="flex-1 font-medium text-foreground">{t('guest.inviteFriend')}</span>
          <ChevronRight size={18} className="text-muted-foreground" />
        </Link>
      )}
    </div>
  );
}
