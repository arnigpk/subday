import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import logo from '@/assets/logo.png';
import { toast } from '@/components/ui/sonner';
interface RegisterScreenProps {
  onComplete: () => void;
  onSwitchToLogin: () => void;
  initialPhone?: string;
}
export function RegisterScreen({
  onComplete,
  onSwitchToLogin,
  initialPhone = ''
}: RegisterScreenProps) {
  const [phone, setPhone] = useState(initialPhone);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'form' | 'code'>('form');
  const [isLoading, setIsLoading] = useState(false);
  const [formattedPhone, setFormattedPhone] = useState('');
  const formatPhoneInput = (value: string) => {
    let digits = value.replace(/\D/g, '');
    if (digits.length > 11) {
      digits = digits.slice(0, 11);
    }
    if (digits.length === 0) return '';
    if (digits.length <= 1) return `+${digits}`;
    if (digits.length <= 4) return `+${digits.slice(0, 1)} ${digits.slice(1)}`;
    if (digits.length <= 7) return `+${digits.slice(0, 1)} ${digits.slice(1, 4)} ${digits.slice(4)}`;
    if (digits.length <= 9) return `+${digits.slice(0, 1)} ${digits.slice(1, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`;
    return `+${digits.slice(0, 1)} ${digits.slice(1, 4)} ${digits.slice(4, 7)} ${digits.slice(7, 9)} ${digits.slice(9)}`;
  };
  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPhone(formatPhoneInput(e.target.value));
  };
  const handleSendCode = async () => {
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 11) {
      toast.error('Введи полный номер телефона');
      return;
    }
    if (!name.trim()) {
      toast.error('Введи имя и фамилию');
      return;
    }
    setIsLoading(true);
    try {
      const {
        data,
        error
      } = await supabase.functions.invoke('send-otp', {
        body: {
          phone: digits,
          isRegistration: true
        }
      });
      if (error) {
        console.error('Send OTP error:', error);
        toast.error('Ошибка отправки кода');
        return;
      }
      if (data.error) {
        toast.error(data.error);
        return;
      }
      setFormattedPhone(data.phone);
      setStep('code');
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
    if (verifyCode.length < 4) {
      toast.error('Введи 4-значный код');
      return;
    }
    setIsLoading(true);
    try {
      const {
        data,
        error
      } = await supabase.functions.invoke('verify-otp', {
        body: {
          phone: formattedPhone,
          code: verifyCode,
          isRegistration: true,
          name: name.trim()
        }
      });
      if (error) {
        console.error('Verify OTP error:', error);
        toast.error('Ошибка проверки кода');
        return;
      }
      if (data.error) {
        toast.error(data.error);
        return;
      }
      if (data.success) {
        toast.success('Регистрация успешна! Теперь войди');
        onComplete();
      } else {
        toast.error('Ошибка регистрации');
      }
    } catch (err) {
      console.error('Error verifying code:', err);
      toast.error('Ошибка проверки');
    } finally {
      setIsLoading(false);
    }
  };
  return <div className="min-h-screen bg-background flex flex-col safe-area-top safe-area-bottom">
      <div className="flex-1 flex flex-col items-center justify-center p-6">
        <div className="w-24 h-24 mb-4 animate-pop">
          <img src={logo} alt="subday" className="w-full h-full object-contain" />
        </div>
        
        <h1 className="text-2xl font-black text-foreground mb-1 animate-slide-up">
          Регистрация
        </h1>
        <p className="text-muted-foreground text-center mb-6 animate-slide-up" style={{
        animationDelay: '0.1s'
      }}>
          Создай аккаунт subday
        </p>
        
        <div className="w-full max-w-sm space-y-4 animate-slide-up" style={{
        animationDelay: '0.2s'
      }}>
          {step === 'form' ? <>
              <div>
                <label className="text-sm font-medium text-muted-foreground mb-2 block">
                  Имя и Фамилия
                </label>
                <input type="text" placeholder="Иван Иванов" value={name} onChange={e => setName(e.target.value)} className="input-field w-full" autoComplete="name" />
              </div>
              
              <div>
                <label className="text-sm font-medium text-muted-foreground mb-2 block">
                  Номер телефона
                </label>
                <input type="tel" placeholder="+7 7XX XXX XX XX" value={phone} onChange={handlePhoneChange} className="input-field w-full" autoComplete="tel" />
              </div>
              
              <button onClick={handleSendCode} disabled={phone.replace(/\D/g, '').length < 11 || !name.trim() || isLoading} className="btn-accent w-full disabled:opacity-50 disabled:cursor-not-allowed text-center">
                {isLoading ? 'Отправляем...' : 'Получить код'}
              </button>
              
              <button onClick={onSwitchToLogin} className="btn-secondary w-full">
                Уже есть аккаунт? Войти
              </button>
            </> : <>
              <div>
                <label className="text-sm font-medium text-muted-foreground mb-2 block">
                  Код из SMS
                </label>
                <input type="text" inputMode="numeric" placeholder="0000" value={code} onChange={e => {
              const newCode = e.target.value.replace(/\D/g, '').slice(0, 4);
              setCode(newCode);
              // Auto-submit when 4 digits entered
              if (newCode.length === 4 && !isLoading) {
                handleVerifyCode(newCode);
              }
            }} className="input-field w-full text-2xl text-center tracking-[0.5em]" maxLength={4} autoComplete="one-time-code" />
                <p className="text-xs text-muted-foreground mt-2 text-center">
                  Отправили на {formattedPhone}
                </p>
              </div>
              
              {isLoading && <div className="flex items-center justify-center py-3">
                  <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  <span className="ml-2 text-muted-foreground">Проверяем...</span>
                </div>}
              
              <button onClick={() => {
            setStep('form');
            setCode('');
          }} className="btn-secondary w-full" disabled={isLoading}>
                Изменить данные
              </button>
            </>}
        </div>
      </div>
      
      <div className="p-6 text-center">
        <p className="text-xs text-muted-foreground">
          Продолжая, ты соглашаешься с условиями использования
        </p>
      </div>
    </div>;
}