import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import logo from '@/assets/logo.png';
import { toast } from '@/components/ui/sonner';
import { ServiceRulesDialog } from './ServiceRulesDialog';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { useSmsCooldown } from '@/hooks/useSmsCooldown';
import { CountryCodePicker, Country, CITIES_BY_COUNTRY, useDetectedCountry } from './CountryCodePicker';
import { ChevronDown } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';

interface RegisterScreenProps {
  onComplete: () => void;
  onSwitchToLogin: () => void;
  initialPhone?: string;
  initialCountry?: Country;
}

export function RegisterScreen({ onComplete, onSwitchToLogin, initialPhone = '', initialCountry }: RegisterScreenProps) {
  const { t } = useLanguage();
  const detectedCountry = useDetectedCountry();
  const [country, setCountry] = useState<Country>(initialCountry || detectedCountry);
  const [countryManuallySet, setCountryManuallySet] = useState(!!initialCountry);
  const [phone, setPhone] = useState(initialPhone);
  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [cityOpen, setCityOpen] = useState(false);
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'form' | 'code'>('form');
  const [isLoading, setIsLoading] = useState(false);
  const [formattedPhone, setFormattedPhone] = useState('');
  const [channel, setChannel] = useState<'whatsapp' | 'sms'>('whatsapp');
  const { remaining, isCoolingDown, startCooldown } = useSmsCooldown(59);

  useEffect(() => {
    if (!countryManuallySet) setCountry(detectedCountry);
  }, [detectedCountry, countryManuallySet]);

  const cities = CITIES_BY_COUNTRY[country.code] || [];

  const formatPhoneInput = (value: string) => {
    return value.replace(/\D/g, '').slice(0, country.phoneLength);
  };

  const getDisplayPhone = (digits: string) => {
    if (!digits) return '';
    if (country.code === 'KZ' || country.code === 'RU') {
      let r = '';
      if (digits.length > 0) r += digits.slice(0, 3);
      if (digits.length > 3) r += ' ' + digits.slice(3, 6);
      if (digits.length > 6) r += ' ' + digits.slice(6, 8);
      if (digits.length > 8) r += ' ' + digits.slice(8, 10);
      return r;
    }
    let r = '';
    if (digits.length > 0) r += digits.slice(0, 3);
    if (digits.length > 3) r += ' ' + digits.slice(3, 6);
    if (digits.length > 6) r += ' ' + digits.slice(6, 9);
    return r;
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPhone(formatPhoneInput(e.target.value));
  };

  const handleCountryChange = (c: Country) => {
    setCountry(c);
    setCountryManuallySet(true);
    setPhone('');
    setCity('');
  };

  const fullPhoneDigits = country.dialCode + phone;
  const isPhoneComplete = phone.length >= country.phoneLength;

  const handleSendCode = async () => {
    if (!isPhoneComplete) { toast.error('Введи полный номер телефона'); return; }
    if (!name.trim()) { toast.error('Введи имя и фамилию'); return; }
    if (!city) { toast.error('Выбери город'); return; }
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-otp', {
        body: { phone: fullPhoneDigits, isRegistration: true, countryCode: country.code, channel }
      });
      if (error) { toast.error('Ошибка отправки кода'); return; }
      if (data?.error) {
        if (data.cooldown) startCooldown(data.cooldown);
        toast.error(data.error);
        return;
      }
      setFormattedPhone(data.phone);
      setStep('code');
      startCooldown(59);
      toast.success(channel === 'whatsapp' ? 'Код отправлен в WhatsApp!' : 'Код отправлен по SMS!');
    } catch (err) {
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
        body: { phone: formattedPhone, code: verifyCode, isRegistration: true, name: name.trim(), city, country: country.code }
      });
      if (error) { toast.error('Ошибка проверки кода'); return; }
      if (data.error) { toast.error(data.error); return; }
      if (data.success) {
        if (data.session) {
          await supabase.auth.setSession({
            access_token: data.session.access_token,
            refresh_token: data.session.refresh_token
          });
          toast.success('Добро пожаловать!');
        } else {
          toast.success('Регистрация успешна!');
        }
        onComplete();
      } else {
        toast.error('Ошибка регистрации');
      }
    } catch (err) {
      toast.error('Ошибка проверки');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col safe-area-top safe-area-bottom">
      <div className="absolute top-4 left-4 z-50">
        <span className="text-2xl">🇰🇿</span>
      </div>
      <div className="absolute top-4 right-4 z-50">
        <LanguageSwitcher />
      </div>
      <div className="flex-1 flex flex-col items-center justify-center p-6">
        <div className="w-24 h-24 mb-4 animate-pop">
          <img src={logo} alt="subday" className="w-full h-full object-contain" />
        </div>
        <h1 className="text-2xl font-black text-foreground mb-1 animate-slide-up">{t('auth.registration')}</h1>
        <p className="text-muted-foreground text-center mb-6 animate-slide-up" style={{ animationDelay: '0.1s' }}>
          {t('auth.createAccount')}
        </p>
        
        <div className="w-full max-w-sm space-y-4 animate-slide-up" style={{ animationDelay: '0.2s' }}>
          {step === 'form' ? (
            <>
              <div>
                <label className="text-sm font-medium text-muted-foreground mb-2 block">{t('auth.nameLabel')}</label>
                <input type="text" placeholder={t('auth.namePlaceholder')} value={name} onChange={e => setName(e.target.value)} className="input-field w-full" autoComplete="name" />
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground mb-2 block">{t('auth.phoneLabel')}</label>
                <div className="flex gap-1.5 w-full">
                  <CountryCodePicker selectedCountry={country} onSelect={handleCountryChange} />
                  <input
                    type="tel"
                    placeholder={country.phoneMask}
                    value={getDisplayPhone(phone)}
                    onChange={handlePhoneChange}
                    className="input-field flex-1 min-w-0 text-base"
                    autoComplete="tel"
                  />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground mb-2 block">{t('auth.cityLabel')}</label>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setCityOpen(!cityOpen)}
                    className="input-field w-full flex items-center justify-between text-left"
                  >
                    <span className={city ? 'text-foreground' : 'text-muted-foreground'}>
                      {city || t('auth.cityPlaceholder')}
                    </span>
                    <ChevronDown className="w-4 h-4 text-muted-foreground" />
                  </button>
                  {cityOpen && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-background border border-border rounded-lg shadow-lg z-50 max-h-48 overflow-y-auto">
                      {cities.map(c => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => { setCity(c); setCityOpen(false); }}
                          className={`w-full text-left px-3 py-2.5 text-sm hover:bg-muted transition-colors ${c === city ? 'bg-muted font-medium' : ''}`}
                        >
                          {c}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="flex rounded-xl border border-border overflow-hidden">
                <button type="button" onClick={() => setChannel('whatsapp')} className={`flex-1 py-2.5 text-sm font-medium transition-colors ${channel === 'whatsapp' ? 'bg-[#25D366] text-white' : 'bg-muted/50 text-muted-foreground hover:bg-muted'}`}>💬 WhatsApp</button>
                <button type="button" onClick={() => setChannel('sms')} className={`flex-1 py-2.5 text-sm font-medium transition-colors ${channel === 'sms' ? 'bg-primary text-primary-foreground' : 'bg-muted/50 text-muted-foreground hover:bg-muted'}`}>📱 SMS</button>
              </div>
              {channel === 'sms' && (
                <p className="text-sm text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 p-3 rounded-lg text-center">
                  {t('auth.beelineWarning')}
                </p>
              )}
              <button onClick={handleSendCode} disabled={!isPhoneComplete || !name.trim() || !city || isLoading || isCoolingDown} className="btn-accent w-full disabled:opacity-50 disabled:cursor-not-allowed">
                {isCoolingDown ? t('auth.resendIn').replace('{sec}', String(remaining)) : isLoading ? t('auth.sending') : t('auth.getCode')}
              </button>
              <button onClick={onSwitchToLogin} className="btn-secondary w-full">
                {t('auth.haveAccount')}
              </button>
            </>
          ) : (
            <>
              <div>
                <label className="text-sm font-medium text-muted-foreground mb-2 block">{t('auth.smsCode')}</label>
                <input
                  type="text" inputMode="numeric" placeholder="0000" value={code}
                  onChange={e => {
                    const newCode = e.target.value.replace(/\D/g, '').slice(0, 4);
                    setCode(newCode);
                    if (newCode.length === 4 && !isLoading) handleVerifyCode(newCode);
                  }}
                  className="input-field w-full text-2xl text-center tracking-[0.5em]" maxLength={4} autoComplete="one-time-code"
                />
                <p className="text-xs text-muted-foreground mt-2 text-center">{t('auth.sentTo')} {formattedPhone}</p>
              </div>
              {isLoading && (
                <div className="flex items-center justify-center py-3">
                  <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  <span className="ml-2 text-muted-foreground">{t('auth.checking')}</span>
                </div>
              )}
              <div className="flex gap-2">
                <button onClick={() => { setStep('form'); setCode(''); }} className="btn-secondary flex-1" disabled={isLoading}>
                  {t('auth.changeData')}
                </button>
                <button onClick={handleSendCode} className="btn-secondary flex-1" disabled={isLoading || isCoolingDown}>
                  {isCoolingDown ? t('auth.secLeft').replace('{sec}', String(remaining)) : t('auth.resend')}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
      <div className="p-6 text-center">
        <p className="text-xs text-muted-foreground">
          {t('auth.termsPrefix')} <ServiceRulesDialog><button type="button" className="text-primary underline hover:text-primary/80 transition-colors">{t('auth.termsLink')}</button></ServiceRulesDialog>.
        </p>
      </div>
    </div>
  );
}
