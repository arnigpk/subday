import { useState } from 'react';
import logo from '@/assets/logo.png';

export function OnboardingScreen({ onComplete }: { onComplete: () => void }) {
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [isLoading, setIsLoading] = useState(false);
  
  const handleSendCode = () => {
    if (phone.length >= 10) {
      setIsLoading(true);
      setTimeout(() => {
        setIsLoading(false);
        setStep('code');
      }, 800);
    }
  };
  
  const handleVerifyCode = () => {
    if (code.length === 4) {
      setIsLoading(true);
      setTimeout(() => {
        setIsLoading(false);
        onComplete();
      }, 800);
    }
  };
  
  return (
    <div className="min-h-screen bg-background flex flex-col safe-area-top safe-area-bottom">
      {/* Header */}
      <div className="flex-1 flex flex-col items-center justify-center p-6">
        <div className="w-28 h-28 mb-6 animate-pop">
          <img src={logo} alt="subday" className="w-full h-full object-contain" />
        </div>
        
        <h1 className="text-3xl font-black text-foreground mb-2 animate-slide-up">
          subday
        </h1>
        <p className="text-muted-foreground text-center mb-8 animate-slide-up" style={{ animationDelay: '0.1s' }}>
          Подписка на кофе в любимых кофейнях
        </p>
        
        <div className="w-full max-w-sm space-y-4 animate-slide-up" style={{ animationDelay: '0.2s' }}>
          {step === 'phone' ? (
            <>
              <div>
                <label className="text-sm font-medium text-muted-foreground mb-2 block">
                  Номер телефона
                </label>
                <input
                  type="tel"
                  placeholder="+7 7XX XXX XX XX"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="input-field w-full text-lg"
                />
              </div>
              
              <button
                onClick={handleSendCode}
                disabled={phone.length < 10 || isLoading}
                className="btn-accent w-full disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? 'Отправляем...' : 'Погнали'}
              </button>
            </>
          ) : (
            <>
              <div>
                <label className="text-sm font-medium text-muted-foreground mb-2 block">
                  Код из SMS
                </label>
                <input
                  type="text"
                  placeholder="0000"
                  value={code}
                  onChange={(e) => setCode(e.target.value.slice(0, 4))}
                  className="input-field w-full text-2xl text-center tracking-[0.5em]"
                  maxLength={4}
                />
                <p className="text-xs text-muted-foreground mt-2 text-center">
                  Отправили на {phone}
                </p>
              </div>
              
              <button
                onClick={handleVerifyCode}
                disabled={code.length < 4 || isLoading}
                className="btn-accent w-full disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? 'Проверяем...' : 'Войти'}
              </button>
              
              <button
                onClick={() => setStep('phone')}
                className="btn-secondary w-full"
              >
                Изменить номер
              </button>
            </>
          )}
        </div>
      </div>
      
      {/* Footer */}
      <div className="p-6 text-center">
        <p className="text-xs text-muted-foreground">
          Продолжая, ты соглашаешься с условиями использования
        </p>
      </div>
    </div>
  );
}
