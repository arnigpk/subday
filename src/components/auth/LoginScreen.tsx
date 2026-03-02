import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import logo from '@/assets/logo.png';
import { toast } from '@/components/ui/sonner';
import { TelegramLoginButton } from './TelegramLoginButton';
import { ServiceRulesDialog } from './ServiceRulesDialog';
import { useSmsCooldown } from '@/hooks/useSmsCooldown';
import { CountryCodePicker, Country, COUNTRIES, detectCountryByTimezone } from './CountryCodePicker';

interface LoginScreenProps {
  onComplete: () => void;
  onSwitchToRegister: (phone?: string, country?: Country) => void;
}

export function LoginScreen({ onComplete, onSwitchToRegister }: LoginScreenProps) {
  const [country, setCountry] = useState<Country>(() => detectCountryByTimezone());
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [isLoading, setIsLoading] = useState(false);
  const [formattedPhone, setFormattedPhone] = useState('');
  const { remaining, isCoolingDown, startCooldown } = useSmsCooldown(59);

  const formatPhoneInput = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, country.phoneLength);
    return digits;
  };

  const getDisplayPhone = (digits: string) => {
    if (!digits) return '';
    // Simple grouping for display
    if (country.code === 'KZ' || country.code === 'RU') {
      // XXX XXX XX XX
      let r = '';
      if (digits.length > 0) r += digits.slice(0, 3);
      if (digits.length > 3) r += ' ' + digits.slice(3, 6);
      if (digits.length > 6) r += ' ' + digits.slice(6, 8);
      if (digits.length > 8) r += ' ' + digits.slice(8, 10);
      return r;
    }
    // KG/UZ: XXX XXX XXX
    let r = '';
    if (digits.length > 0) r += digits.slice(0, 3);
    if (digits.length > 3) r += ' ' + digits.slice(3, 6);
    if (digits.length > 6) r += ' ' + digits.slice(6, 9);
    return r;
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPhone(formatPhoneInput(e.target.value));
  };

  const fullPhoneDigits = country.dialCode + phone;
  const isPhoneComplete = phone.length >= country.phoneLength;

  const handleSendCode = async () => {
    if (!isPhoneComplete) { toast.error('Введи полный номер телефона'); return; }
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-otp', {
        body: { phone: fullPhoneDigits, isRegistration: false, countryCode: country.code }
      });

      if (error) {
        let errorText = '';
        if (error.message) {
          try { errorText = JSON.parse(error.message).error || ''; } catch { errorText = error.message; }
        }
        const ctx = (error as any).context;
        if (ctx?.body) { try { errorText = JSON.parse(ctx.body).error || errorText; } catch {} }
        if (ctx?.json?.error) errorText = ctx.json.error;

        if (errorText.includes('Зарегистрируйтесь') || errorText.includes('не найден')) {
          toast.info('Зарегистрируйтесь, пожалуйста 👋');
          onSwitchToRegister(phone, country);
          return;
        }
        toast.error(errorText || 'Ошибка отправки кода');
        return;
      }

      if (data?.error) {
        if (data.cooldown) { startCooldown(data.cooldown); toast.error(data.error); return; }
        if (data.error.includes('Зарегистрируйтесь') || data.error.includes('не найден')) {
          toast.info('Зарегистрируйтесь, пожалуйста 👋');
          onSwitchToRegister(phone, country);
        } else {
          toast.error(data.error);
        }
        return;
      }

      setFormattedPhone(data.phone);
      setStep('code');
      startCooldown(59);
      toast.success('Код отправлен!');
    } catch (err) {
      console.error('Error sending code:', err);
      toast.error('Ошибка отправки');
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyCode = async (codeToVerify?: string) => {
    const verifyCode = codeToVerify || code;
    if (verifyCode.length < 4) { toast.error('Введи 4-значный код'); return; }
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('verify-otp', {
        body: { phone: formattedPhone, code: verifyCode, isRegistration: false }
      });
      if (error) { toast.error('Ошибка проверки кода'); return; }
      if (data.error) { toast.error(data.error); return; }
      if (data.session) {
        await supabase.auth.setSession({
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token
        });
        toast.success('Добро пожаловать!');
        onComplete();
      } else {
        toast.error('Ошибка авторизации');
      }
    } catch (err) {
      toast.error('Ошибка проверки');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendCode = async () => {
    if (isCoolingDown) return;
    setCode('');
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-otp', {
        body: { phone: formattedPhone, isRegistration: false }
      });
      if (error || data?.error) {
        if (data?.cooldown) { startCooldown(data.cooldown); toast.error(data.error); }
        else toast.error('Ошибка повторной отправки');
        return;
      }
      startCooldown(59);
      toast.success('Код отправлен повторно!');
    } catch (err) {
      toast.error('Ошибка отправки');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col safe-area-top safe-area-bottom">
      <div className="flex-1 flex flex-col items-center justify-center p-6">
        <div className="w-28 h-28 mb-6 animate-pop">
          <img src={logo} alt="subday" className="w-full h-full object-contain" />
        </div>
        <p className="text-muted-foreground text-center mb-8 animate-slide-up" style={{ animationDelay: '0.1s' }}>
          Specialty Coffee & HoReCa Subscriptions
        </p>
        
        <div className="w-full max-w-sm space-y-4 animate-slide-up" style={{ animationDelay: '0.2s' }}>
          {step === 'phone' ? (
            <>
              <div>
                <label className="text-sm font-medium text-muted-foreground mb-2 block">Введите ваш номер👇</label>
                <div className="flex gap-2">
                  <CountryCodePicker selectedCountry={country} onSelect={c => { setCountry(c); setPhone(''); }} />
                  <input
                    type="tel"
                    placeholder={country.phoneMask}
                    value={getDisplayPhone(phone)}
                    onChange={handlePhoneChange}
                    className="input-field flex-1 text-lg"
                    autoComplete="tel"
                  />
                </div>
              </div>
              <p className="text-sm text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 p-3 rounded-lg text-center">
                Отправка смс на beeline временно недоступна по техническим причинам, используйте пожалуйста Telegram для входа.
              </p>
              <button onClick={handleSendCode} disabled={!isPhoneComplete || isLoading || isCoolingDown} className="btn-accent w-full disabled:opacity-50 disabled:cursor-not-allowed">
                {isCoolingDown ? `Повторно через ${remaining} сек.` : isLoading ? 'Отправляем...' : 'Войти'}
              </button>
              <button onClick={() => onSwitchToRegister(undefined, country)} className="btn-secondary w-full">
                Нет аккаунта? Регистрация
              </button>
            </>
          ) : (
            <>
              <div>
                <label className="text-sm font-medium text-muted-foreground mb-2 block">Код из SMS</label>
                <input
                  type="text" inputMode="numeric" placeholder="0000" value={code}
                  onChange={e => {
                    const newCode = e.target.value.replace(/\D/g, '').slice(0, 4);
                    setCode(newCode);
                    if (newCode.length === 4 && !isLoading) handleVerifyCode(newCode);
                  }}
                  className="input-field w-full text-2xl text-center tracking-[0.5em]" maxLength={4} autoComplete="one-time-code"
                />
                <p className="text-xs text-muted-foreground mt-2 text-center">Отправили на {formattedPhone}</p>
              </div>
              {isLoading && (
                <div className="flex items-center justify-center py-3">
                  <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  <span className="ml-2 text-muted-foreground">Проверяем...</span>
                </div>
              )}
              <div className="flex gap-2">
                <button onClick={() => { setStep('phone'); setCode(''); }} className="btn-secondary flex-1" disabled={isLoading}>
                  Изменить номер
                </button>
                <button onClick={handleResendCode} className="btn-secondary flex-1" disabled={isLoading || isCoolingDown}>
                  {isCoolingDown ? `${remaining} сек.` : 'Отправить снова'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
      
      <div className="px-6 pb-6 space-y-3">
        <div className="relative">
          <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-border" /></div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-background px-2 text-muted-foreground">или</span>
          </div>
        </div>
        <div className="w-full max-w-sm mx-auto">
          <TelegramLoginButton botName="subday_lgbot" onSuccess={onComplete} />
        </div>
        <p className="text-xs text-muted-foreground text-center">
          Продолжая пользоваться приложением, вы соглашаетесь с <ServiceRulesDialog><button type="button" className="text-primary underline hover:text-primary/80 transition-colors">правилами сервиса</button></ServiceRulesDialog>.
        </p>
      </div>
    </div>
  );
}
