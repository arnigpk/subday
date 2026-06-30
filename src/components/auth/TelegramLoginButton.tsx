import { useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/components/ui/sonner';
import { Send, Loader2, ArrowLeft } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';

interface TelegramLoginButtonProps {
  onSuccess: () => void;
  botName: string;
}

export function TelegramLoginButton({ onSuccess, botName }: TelegramLoginButtonProps) {
  const { t } = useLanguage();
  const [step, setStep] = useState<'button' | 'code'>('button');
  const [code, setCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleOpenTelegram = () => {
    window.open(`tg://resolve?domain=${botName}&start=login`, Capacitor.isNativePlatform() ? '_system' : '_blank');
    setStep('code');
  };

  const handleVerifyCode = async (codeToVerify?: string) => {
    const verifyCode = codeToVerify || code;
    if (verifyCode.length !== 6) {
      toast.error('Введите 6-значный код');
      return;
    }

    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('telegram-verify-code', {
        body: { code: verifyCode }
      });

      if (error) {
        console.error('Verify error:', error);
        toast.error('Ошибка проверки кода');
        return;
      }

      if (data.error) {
        toast.error(data.error);
        return;
      }

      if (data.session) {
        await supabase.auth.setSession({
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token
        });
        toast.success('Добро пожаловать!');
        onSuccess();
      }
    } catch (err) {
      console.error('Verify error:', err);
      toast.error('Ошибка проверки');
    } finally {
      setIsLoading(false);
    }
  };

  if (step === 'code') {
    return (
      <div className="space-y-3">
        <div>
          <label className="text-sm font-medium text-muted-foreground mb-2 block">
            {t('auth.telegramCode')}
          </label>
          <input
            type="text"
            inputMode="numeric"
            placeholder="000000"
            value={code}
            onChange={(e) => {
              const newCode = e.target.value.replace(/\D/g, '').slice(0, 6);
              setCode(newCode);
              if (newCode.length === 6 && !isLoading) {
                handleVerifyCode(newCode);
              }
            }}
            className="input-field w-full text-2xl text-center tracking-[0.3em]"
            maxLength={6}
          />
          <p className="text-xs text-muted-foreground mt-2 text-center">
            {t('auth.confirmCode')} @{botName}
          </p>
        </div>

        {isLoading && (
          <div className="flex items-center justify-center py-2">
            <Loader2 size={20} className="animate-spin text-primary" />
            <span className="ml-2 text-sm text-muted-foreground">{t('auth.checking')}</span>
          </div>
        )}

        <div className="flex gap-2">
          <button
            onClick={() => {
              setStep('button');
              setCode('');
            }}
            className="btn-secondary flex-1 flex items-center justify-center gap-2"
            disabled={isLoading}
          >
            <ArrowLeft size={16} />
            {t('auth.back')}
          </button>
          <button
            onClick={() => {
              setCode('');
              window.open(`tg://resolve?domain=${botName}&start=login`, Capacitor.isNativePlatform() ? '_system' : '_blank');
            }}
            className="flex-1 flex items-center justify-center gap-2 h-12 px-4 rounded-xl bg-[#0088cc] hover:bg-[#0077b5] text-white font-medium transition-colors"
          >
            <Send size={16} />
            {t('auth.newCode')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <button
      onClick={handleOpenTelegram}
      disabled={isLoading}
      className="w-full flex items-center justify-center gap-2 h-12 px-4 rounded-xl bg-[#0088cc] hover:bg-[#0077b5] text-white font-medium transition-colors disabled:opacity-50"
    >
      <Send size={20} />
      {t('auth.loginViaTelegram')}
    </button>
  );
}
