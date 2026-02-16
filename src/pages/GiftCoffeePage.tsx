import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { Gift } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/components/ui/sonner';
import { useLanguage } from '@/contexts/LanguageContext';

export default function GiftCoffeePage() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [publicId, setPublicId] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleGrant = async () => {
    const value = publicId.trim();
    if (!value) {
      toast.error(t('guest.invalidInput'));
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
          const parsed = JSON.parse(error.message);
          errMsg = parsed.error || errMsg;
        } catch {
          errMsg = error.message || errMsg;
        }
        toast.error(errMsg);
        return;
      }

      if (data?.error) {
        toast.error(data.error);
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
      }

      navigate('/profile');
    } catch (err) {
      console.error('Grant error:', err);
      toast.error('Ошибка');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AppLayout>
      <div className="safe-area-top">
        <div className="px-4 py-4">
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
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
