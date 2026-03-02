import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import logo from '@/assets/logo.png';
import { toast } from '@/components/ui/sonner';
import { ServiceRulesDialog } from './ServiceRulesDialog';
import { useSmsCooldown } from '@/hooks/useSmsCooldown';
import { CountryCodePicker, Country, COUNTRIES, CITIES_BY_COUNTRY, detectCountryByTimezone } from './CountryCodePicker';
import { ChevronDown } from 'lucide-react';

interface RegisterScreenProps {
  onComplete: () => void;
  onSwitchToLogin: () => void;
  initialPhone?: string;
  initialCountry?: Country;
}

export function RegisterScreen({ onComplete, onSwitchToLogin, initialPhone = '', initialCountry }: RegisterScreenProps) {
  const [country, setCountry] = useState<Country>(initialCountry || detectCountryByTimezone());
  const [phone, setPhone] = useState(initialPhone);
  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [cityOpen, setCityOpen] = useState(false);
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'form' | 'code'>('form');
  const [isLoading, setIsLoading] = useState(false);
  const [formattedPhone, setFormattedPhone] = useState('');
  const { remaining, isCoolingDown, startCooldown } = useSmsCooldown(59);

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
        body: { phone: fullPhoneDigits, isRegistration: true, countryCode: country.code }
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
      toast.success('Код отправлен!');
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
        toast.success('Регистрация успешна! Теперь войди');
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
      <div className="flex-1 flex flex-col items-center justify-center p-6">
        <div className="w-24 h-24 mb-4 animate-pop">
          <img src={logo} alt="subday" className="w-full h-full object-contain" />
        </div>
        <h1 className="text-2xl font-black text-foreground mb-1 animate-slide-up">Регистрация</h1>
        <p className="text-muted-foreground text-center mb-6 animate-slide-up" style={{ animationDelay: '0.1s' }}>
          Создай аккаунт subday
        </p>
        
        <div className="w-full max-w-sm space-y-4 animate-slide-up" style={{ animationDelay: '0.2s' }}>
          {step === 'form' ? (
            <>
              <div>
                <label className="text-sm font-medium text-muted-foreground mb-2 block">Имя и Фамилия</label>
                <input type="text" placeholder="Иван Иванов" value={name} onChange={e => setName(e.target.value)} className="input-field w-full" autoComplete="name" />
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground mb-2 block">Номер телефона</label>
                <div className="flex gap-2">
                  <CountryCodePicker selectedCountry={country} onSelect={handleCountryChange} />
                  <input
                    type="tel"
                    placeholder={country.phoneMask}
                    value={getDisplayPhone(phone)}
                    onChange={handlePhoneChange}
                    className="input-field flex-1"
                    autoComplete="tel"
                  />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground mb-2 block">Город</label>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setCityOpen(!cityOpen)}
                    className="input-field w-full flex items-center justify-between text-left"
                  >
                    <span className={city ? 'text-foreground' : 'text-muted-foreground'}>
                      {city || 'Выберите город'}
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
              <p className="text-sm text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 p-3 rounded-lg text-center">
                Отправка смс на beeline временно недоступна по техническим причинам, используйте пожалуйста Telegram для входа.
              </p>
              <button onClick={handleSendCode} disabled={!isPhoneComplete || !name.trim() || !city || isLoading || isCoolingDown} className="btn-accent w-full disabled:opacity-50 disabled:cursor-not-allowed">
                {isCoolingDown ? `Повторно через ${remaining} сек.` : isLoading ? 'Отправляем...' : 'Получить код'}
              </button>
              <button onClick={onSwitchToLogin} className="btn-secondary w-full">
                Уже есть аккаунт? Войти
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
                <button onClick={() => { setStep('form'); setCode(''); }} className="btn-secondary flex-1" disabled={isLoading}>
                  Изменить данные
                </button>
                <button onClick={handleSendCode} className="btn-secondary flex-1" disabled={isLoading || isCoolingDown}>
                  {isCoolingDown ? `${remaining} сек.` : 'Отправить снова'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
      <div className="p-6 text-center">
        <p className="text-xs text-muted-foreground">
          Продолжая пользоваться приложением, вы соглашаетесь с <ServiceRulesDialog><button type="button" className="text-primary underline hover:text-primary/80 transition-colors">правилами сервиса</button></ServiceRulesDialog>.
        </p>
      </div>
    </div>
  );
}
