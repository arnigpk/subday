import { useState } from 'react';
import { LoginScreen } from './LoginScreen';
import { RegisterScreen } from './RegisterScreen';

interface AuthScreenProps {
  onComplete: () => void;
}

export function AuthScreen({ onComplete }: AuthScreenProps) {
  const [mode, setMode] = useState<'login' | 'register'>('login');

  if (mode === 'register') {
    return (
      <RegisterScreen
        onComplete={() => setMode('login')}
        onSwitchToLogin={() => setMode('login')}
      />
    );
  }

  return (
    <LoginScreen
      onComplete={onComplete}
      onSwitchToRegister={() => setMode('register')}
    />
  );
}
