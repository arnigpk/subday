import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/components/ui/sonner';
import { Send, Loader2 } from 'lucide-react';

interface TelegramLoginButtonProps {
  onSuccess: () => void;
  botName: string;
}

export function TelegramLoginButton({ onSuccess, botName }: TelegramLoginButtonProps) {
  const [isLoading, setIsLoading] = useState(false);

  const handleTelegramLogin = () => {
    // Generate a unique auth token for this session
    const authToken = crypto.randomUUID();
    
    // Store the token in sessionStorage to verify callback
    sessionStorage.setItem('telegram_auth_token', authToken);
    
    // Open Telegram bot with start parameter
    const telegramUrl = `https://t.me/${botName}?start=auth_${authToken}`;
    window.open(telegramUrl, '_blank');
    
    toast.info('Авторизуйтесь в Telegram и следуйте инструкциям бота');
  };

  return (
    <button
      onClick={handleTelegramLogin}
      disabled={isLoading}
      className="w-full flex items-center justify-center gap-2 h-12 px-4 rounded-xl bg-[#0088cc] hover:bg-[#0077b5] text-white font-medium transition-colors disabled:opacity-50"
    >
      {isLoading ? (
        <Loader2 size={20} className="animate-spin" />
      ) : (
        <Send size={20} />
      )}
      {isLoading ? 'Авторизация...' : 'Войти через Telegram'}
    </button>
  );
}
