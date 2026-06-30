import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import logo from '@/assets/logo.png';
import { toast } from '@/components/ui/sonner';
import { ServiceRulesDialog } from './ServiceRulesDialog';
import { PaymentLogos } from './PaymentLogos';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { useChannelCooldowns } from '@/hooks/useSmsCooldown';
import { CountryCodePicker, Country, CITIES_BY_COUNTRY, useDetectedCountry } from './CountryCodePicker';
import { ChevronDown } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';

interface RegisterScreenProps {
  onComplete: (isNewUser?: boolean) => void;
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
  const cooldowns = useChannelCooldowns(59);
  const { remaining, isCoolingDown, startCooldown } = cooldowns.getCooldown(channel);

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
        body: { phone: formattedPhone, code: verifyCode, isRegistration: true, name: name.trim(), city, country: country.code, channel }
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
        onComplete(true);
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
    <div className="min-h-screen bg-background flex flex-col">
      <div className="safe-area-top" />
      <div className="absolute z-50" style={{ top: 'calc(env(safe-area-inset-top, 0px) + 16px)', left: '16px' }}>
        <span className="text-2xl">🇰🇿</span>
      </div>
      <div className="absolute z-50" style={{ top: 'calc(env(safe-area-inset-top, 0px) + 16px)', right: '16px' }}>
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
                <button type="button" onClick={() => setChannel('whatsapp')} className={`flex-1 py-2.5 text-sm font-medium transition-colors flex items-center justify-center gap-1.5 ${channel === 'whatsapp' ? 'bg-[#25D366] text-white' : 'bg-muted/50 text-muted-foreground hover:bg-muted'}`}><svg viewBox="0 0 24 24" className="w-4 h-4 fill-current"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg> WhatsApp</button>
                <button type="button" onClick={() => setChannel('sms')} className={`flex-1 py-2.5 text-sm font-medium transition-colors ${channel === 'sms' ? 'bg-primary text-primary-foreground' : 'bg-muted/50 text-muted-foreground hover:bg-muted'}`}>📱 SMS</button>
              </div>
              {channel === 'sms' && (
                <p className="text-sm text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 p-3 rounded-lg text-center">
                  {t('auth.beelineWarningRegister')}
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
                <label className="text-sm font-medium text-muted-foreground mb-2 block">{channel === 'whatsapp' ? t('auth.whatsappCode') : t('auth.smsCode')}</label>
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
      <div className="p-6 text-center safe-area-bottom">
        <p className="text-xs text-muted-foreground">
          {t('auth.termsPrefix')} <ServiceRulesDialog><button type="button" className="text-primary underline hover:text-primary/80 transition-colors">{t('auth.termsLink')}</button></ServiceRulesDialog>.
        </p>
        <PaymentLogos />
      </div>
    </div>
  );
}
