import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Gift, Copy, ChevronRight } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/components/ui/sonner';
import { useLanguage } from '@/contexts/LanguageContext';
import { useSubscriptionStatus } from '@/hooks/useSubscriptionStatus';

export function GuestAccessSection() {
  const { t } = useLanguage();
  const [publicId, setPublicId] = useState('');
  const [monthlyUsed, setMonthlyUsed] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const { hasActiveSubscription } = useSubscriptionStatus();

  const fetchStatus = useCallback(async () => {
    try {
      const { data, error } = await supabase.functions.invoke('guest-access', {
        body: { action: 'status' },
      });
      if (!error && data) {
        setPublicId(data.publicId || '');
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

  if (!hasActiveSubscription) return null;

  const handleCopyId = () => {
    if (publicId) {
      navigator.clipboard.writeText(publicId);
      toast.success(t('profile.copied'));
    }
  };

  return (
    <div className="space-y-2 animate-slide-up" style={{ animationDelay: '0.12s' }}>
      <h3 className="text-sm font-semibold text-muted-foreground px-1 mb-2">
        {t('guest.title')}
      </h3>

      {/* Public ID */}
      <div className="card-static flex items-center gap-3">
        <Gift size={20} className="text-primary flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <span className="text-sm text-muted-foreground">{t('guest.yourId')}</span>
          <span className="ml-1 font-bold text-foreground font-mono">
            {isLoading ? '...' : publicId}
          </span>
        </div>
        <button
          onClick={handleCopyId}
          className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-primary bg-primary/10 rounded-lg hover:bg-primary/20 transition-colors"
        >
          <Copy size={12} />
          {t('guest.copy')}
        </button>
      </div>

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
