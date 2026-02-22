import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { ArrowLeft, Gift, User, Copy } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/components/ui/sonner';
import { useLanguage } from '@/contexts/LanguageContext';
import { useVibration } from '@/hooks/useVibration';
import { useSubscriptionStatus } from '@/hooks/useSubscriptionStatus';

export default function GiftCoffeePage() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [publicId, setPublicId] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { vibrateSuccess, vibrateError } = useVibration();
  const { activeSubscriptions, isLoading: subLoading } = useSubscriptionStatus();
  const hasCoffeeSubscription = activeSubscriptions.some(s => s.subscription_type === 'coffee');

  // Redirect if no coffee subscription
  useEffect(() => {
    if (!subLoading && !hasCoffeeSubscription) {
      navigate('/profile');
    }
  }, [subLoading, hasCoffeeSubscription, navigate]);

  const handleGrant = async () => {
    const value = publicId.trim();
    if (!value) {
      toast.error(t('guest.invalidInput'));
      vibrateError();
      return;
    }

    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('guest-access', {
        body: { action: 'grant', mode: 'public_id', value },
      });

      if (error) {
        let errMsg = 'Ошибка';
        try {
          if (error.context && typeof error.context.json === 'function') {
            const body = await error.context.json();
            errMsg = body?.error || errMsg;
          } else {
            const parsed = JSON.parse(error.message);
            errMsg = parsed.error || errMsg;
          }
        } catch {
          errMsg = error.message || errMsg;
        }
        toast.error(errMsg);
        vibrateError();
        return;
      }

      if (data?.error) {
        toast.error(data.error);
        vibrateError();
        return;
      }

      if (data?.status === 'active') {
        const expiresDate = data.expires_at
          ? new Date(data.expires_at).toLocaleDateString('ru-RU')
          : '';
        toast.success(
          `${t('guest.successMessage')}${expiresDate ? `\nДействует до: ${expiresDate}` : ''}`,
          { duration: 6000 }
        );
        vibrateSuccess();
      }

      navigate('/profile');
    } catch (err) {
      console.error('Grant error:', err);
      toast.error('Ошибка');
      vibrateError();
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AppLayout>
      <div className="safe-area-top">
        <div className="px-4 py-4">
          <button onClick={() => navigate('/profile')} className="flex items-center gap-2 text-muted-foreground mb-4">
            <ArrowLeft size={20} />
            <span>{t('packageDetail.back')}</span>
          </button>

          <div className="text-center mb-6">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-3">
              <Gift size={32} className="text-primary" />
            </div>
            <h1 className="text-2xl font-black text-foreground">{t('guest.giftTitle')}</h1>
            <p className="text-sm text-muted-foreground mt-2 max-w-xs mx-auto">
              {t('guest.giftSubtitle')}
            </p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-muted-foreground mb-2 block">
                {t('guest.enterId')}
              </label>
              <input
                type="text"
                placeholder="123456"
                value={publicId}
                onChange={(e) => setPublicId(e.target.value.replace(/\D/g, '').slice(0, 6))}
                className="input-field w-full text-lg text-center tracking-widest"
                inputMode="numeric"
                maxLength={6}
              />
            </div>

            <button
              onClick={handleGrant}
              disabled={isLoading || !publicId.trim()}
              className="btn-accent w-full disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? t('guest.granting') : t('guest.grantButton')}
            </button>

            {/* Visual hint: mini profile showing where to find ID */}
            <div className="bg-muted/50 rounded-xl p-4">
              <p className="text-sm font-medium text-foreground mb-3">{t('guest.whereToFindId')}</p>
              
              {/* Mini profile mockup */}
              <div className="bg-card rounded-xl p-3 border border-border shadow-sm">
                <div className="flex items-center gap-3">
                  {/* Avatar placeholder */}
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <User size={20} className="text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-foreground truncate">Айдана</p>
                    {/* Highlighted ID row */}
                    <div className="flex items-center gap-1 mt-0.5">
                      <div className="relative">
                        <span className="text-xs text-muted-foreground font-mono px-1.5 py-0.5 rounded bg-accent/15 border border-accent/30 animate-pulse">
                          ID: 123456
                        </span>
                      </div>
                      <Copy size={10} className="text-accent" />
                    </div>
                  </div>
                </div>
                {/* Arrow pointing to ID */}
                <div className="flex items-center gap-2 mt-2 ml-[52px]">
                  <span className="text-accent text-xs">↑</span>
                  <span className="text-[11px] text-muted-foreground">{t('guest.whereToFindIdDesc')}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
