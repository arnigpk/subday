import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { ArrowLeft, Gift, Phone, Hash } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/components/ui/sonner';
import { useLanguage } from '@/contexts/LanguageContext';

export default function GiftCoffeePage() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState<'phone' | 'id'>('phone');
  const [phone, setPhone] = useState('');
  const [publicId, setPublicId] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const formatPhoneInput = (value: string) => {
    let digits = value.replace(/\D/g, '');
    if (digits.length > 11) digits = digits.slice(0, 11);
    if (digits.length === 0) return '';
    if (digits.length <= 1) return `+${digits}`;
    if (digits.length <= 4) return `+${digits.slice(0, 1)} ${digits.slice(1)}`;
    if (digits.length <= 7) return `+${digits.slice(0, 1)} ${digits.slice(1, 4)} ${digits.slice(4)}`;
    if (digits.length <= 9) return `+${digits.slice(0, 1)} ${digits.slice(1, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`;
    return `+${digits.slice(0, 1)} ${digits.slice(1, 4)} ${digits.slice(4, 7)} ${digits.slice(7, 9)} ${digits.slice(9)}`;
  };

  const handleGrant = async () => {
    const mode = activeTab === 'phone' ? 'phone' : 'public_id';
    const value = activeTab === 'phone' ? phone.replace(/\D/g, '') : publicId.trim();

    if (activeTab === 'phone' && value.length < 10) {
      toast.error(t('guest.invalidInput'));
      return;
    }
    if (activeTab === 'id' && !value) {
      toast.error(t('guest.invalidInput'));
      return;
    }

    setIsLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const { data, error } = await supabase.functions.invoke('guest-access', {
        body: { action: 'grant', mode, value },
      });

      if (error) {
        // Try to extract error from response
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

      if (data?.status === 'pending') {
        toast.success(t('guest.pendingMessage'), { duration: 6000 });
      } else if (data?.status === 'active') {
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

          {/* Tabs */}
          <div className="flex bg-secondary rounded-xl p-1 mb-6">
            <button
              onClick={() => setActiveTab('phone')}
              className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-semibold transition-all duration-200 flex items-center justify-center gap-2 ${
                activeTab === 'phone' ? 'tab-active shadow-sm' : 'tab-inactive hover:text-foreground'
              }`}
            >
              <Phone size={16} />
              {t('guest.byPhone')}
            </button>
            <button
              onClick={() => setActiveTab('id')}
              className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-semibold transition-all duration-200 flex items-center justify-center gap-2 ${
                activeTab === 'id' ? 'tab-active shadow-sm' : 'tab-inactive hover:text-foreground'
              }`}
            >
              <Hash size={16} />
              {t('guest.byId')}
            </button>
          </div>

          {/* Input */}
          <div className="space-y-4">
            {activeTab === 'phone' ? (
              <div>
                <label className="text-sm font-medium text-muted-foreground mb-2 block">
                  {t('guest.enterPhone')}
                </label>
                <input
                  type="tel"
                  placeholder="+7 7XX XXX XX XX"
                  value={phone}
                  onChange={(e) => setPhone(formatPhoneInput(e.target.value))}
                  className="input-field w-full text-lg"
                  autoComplete="tel"
                />
              </div>
            ) : (
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
            )}

            <button
              onClick={handleGrant}
              disabled={isLoading || (activeTab === 'phone' ? phone.replace(/\D/g, '').length < 10 : !publicId.trim())}
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
