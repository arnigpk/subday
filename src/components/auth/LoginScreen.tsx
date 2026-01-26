import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import logo from '@/assets/logo.png';
import { toast } from '@/components/ui/sonner';
import { TelegramLoginButton } from './TelegramLoginButton';
interface LoginScreenProps {
  onComplete: () => void;
  onSwitchToRegister: () => void;
}
export function LoginScreen({
  onComplete,
  onSwitchToRegister
}: LoginScreenProps) {
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'phone' | 'code'>('phone');
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
    setIsLoading(true);
    try {
      const {
        data,
        error
      } = await supabase.functions.invoke('send-otp', {
        body: {
          phone: digits,
          isRegistration: false
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
          isRegistration: false
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
      console.error('Error verifying code:', err);
      toast.error('Ошибка проверки');
    } finally {
      setIsLoading(false);
    }
  };
  const handleResendCode = async () => {
    setCode('');
    setIsLoading(true);
    try {
      const {
        data,
        error
      } = await supabase.functions.invoke('send-otp', {
        body: {
          phone: formattedPhone,
          isRegistration: false
        }
      });
      if (error || data.error) {
        toast.error('Ошибка повторной отправки');
        return;
      }
      toast.success('Код отправлен повторно!');
    } catch (err) {
      toast.error('Ошибка отправки');
    } finally {
      setIsLoading(false);
    }
  };
  return <div className="min-h-screen bg-background flex flex-col safe-area-top safe-area-bottom">
      <div className="flex-1 flex flex-col items-center justify-center p-6">
        <div className="w-28 h-28 mb-6 animate-pop">
          <img src={logo} alt="subday" className="w-full h-full object-contain" />
        </div>
        
        
        <p className="text-muted-foreground text-center mb-8 animate-slide-up" style={{
        animationDelay: '0.1s'
      }}>
          Specialty Coffee & HoReCa Subscriptions
        </p>
        
        <div className="w-full max-w-sm space-y-4 animate-slide-up" style={{
        animationDelay: '0.2s'
      }}>
          {step === 'phone' ? <>
              <div>
                <label className="text-sm font-medium text-muted-foreground mb-2 block">
                  Введите ваш номер👇
                </label>
                <input type="tel" placeholder="+7 7XX XXX XX XX" value={phone} onChange={handlePhoneChange} className="input-field w-full text-lg" autoComplete="tel" />
              </div>
              
              <button onClick={handleSendCode} disabled={phone.replace(/\D/g, '').length < 11 || isLoading} className="btn-accent w-full disabled:opacity-50 disabled:cursor-not-allowed">
                {isLoading ? 'Отправляем...' : 'Войти'}
              </button>
              
              <button onClick={onSwitchToRegister} className="btn-secondary w-full">
                Нет аккаунта? Регистрация
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
              
              <div className="flex gap-2">
                <button onClick={() => {
              setStep('phone');
              setCode('');
            }} className="btn-secondary flex-1" disabled={isLoading}>
                  Изменить номер
                </button>
                <button onClick={handleResendCode} className="btn-secondary flex-1" disabled={isLoading}>
                  Отправить снова
                </button>
              </div>
            </>}
        </div>
      </div>
      
      <div className="px-6 pb-6 space-y-3">
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-border" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-background px-2 text-muted-foreground">или</span>
          </div>
        </div>
        
        <div className="w-full max-w-sm mx-auto">
          <TelegramLoginButton botName="subday_lgbot" onSuccess={onComplete} />
        </div>
        
        <p className="text-xs text-muted-foreground text-center">Продолжая пользоваться приложением, ты соглашаешься отсосать Ануару!!!</p>
      </div>
    </div>;
}