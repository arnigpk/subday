import { useState } from 'react';
import { LoginScreen } from './LoginScreen';
import { RegisterScreen } from './RegisterScreen';
import { Country } from './CountryCodePicker';

interface AuthScreenProps {
  onComplete: (isNewUser?: boolean) => void;
  onGuestBrowse?: () => void;
}

export function AuthScreen({ onComplete, onGuestBrowse }: AuthScreenProps) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [prefillPhone, setPrefillPhone] = useState('');
  const [prefillCountry, setPrefillCountry] = useState<Country | undefined>();

  const handleSwitchToRegister = (phone?: string, country?: Country) => {
    if (phone) setPrefillPhone(phone);
    if (country) setPrefillCountry(country);
    setMode('register');
  };

  if (mode === 'register') {
    return (
      <RegisterScreen
        onComplete={onComplete}
        onSwitchToLogin={() => {
          setPrefillPhone('');
          setPrefillCountry(undefined);
          setMode('login');
        }}
        initialPhone={prefillPhone}
        initialCountry={prefillCountry}
      />
    );
  }

  return (
    <LoginScreen
      onComplete={onComplete}
      onSwitchToRegister={handleSwitchToRegister}
      onGuestBrowse={onGuestBrowse}
    />
  );
}
