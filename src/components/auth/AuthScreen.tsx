import { useState } from 'react';
import { LoginScreen } from './LoginScreen';
import { RegisterScreen } from './RegisterScreen';

interface AuthScreenProps {
  onComplete: () => void;
}

export function AuthScreen({ onComplete }: AuthScreenProps) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [prefillPhone, setPrefillPhone] = useState('');

  const handleSwitchToRegister = (phone?: string) => {
    if (phone) {
      setPrefillPhone(phone);
    }
    setMode('register');
  };

  if (mode === 'register') {
    return (
      <RegisterScreen
        onComplete={() => setMode('login')}
        onSwitchToLogin={() => {
          setPrefillPhone('');
          setMode('login');
        }}
        initialPhone={prefillPhone}
      />
    );
  }

  return (
    <LoginScreen
      onComplete={onComplete}
      onSwitchToRegister={handleSwitchToRegister}
    />
  );
}
