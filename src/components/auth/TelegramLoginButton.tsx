import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/components/ui/sonner';
import { Send, Loader2 } from 'lucide-react';

interface TelegramLoginButtonProps {
  onSuccess: () => void;
  botName: string;
}

declare global {
  interface Window {
    TelegramLoginWidget: {
      dataOnauth: (user: TelegramUser) => void;
    };
  }
}

interface TelegramUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
}

export function TelegramLoginButton({ onSuccess, botName }: TelegramLoginButtonProps) {
  const [isLoading, setIsLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetLoaded = useRef(false);

  const handleTelegramAuth = async (user: TelegramUser) => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('telegram-auth', {
        body: { authData: user }
      });

      if (error) {
        console.error('Telegram auth error:', error);
        toast.error('Ошибка авторизации через Telegram');
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
        onSuccess();
      }
    } catch (err) {
      console.error('Telegram auth error:', err);
      toast.error('Ошибка авторизации');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (widgetLoaded.current) return;
    
    // Set up global callback
    window.TelegramLoginWidget = {
      dataOnauth: handleTelegramAuth
    };

    // Load Telegram widget script
    const script = document.createElement('script');
    script.src = 'https://telegram.org/js/telegram-widget.js?22';
    script.setAttribute('data-telegram-login', botName);
    script.setAttribute('data-size', 'large');
    script.setAttribute('data-radius', '12');
    script.setAttribute('data-onauth', 'TelegramLoginWidget.dataOnauth(user)');
    script.setAttribute('data-request-access', 'write');
    script.async = true;

    if (containerRef.current) {
      containerRef.current.appendChild(script);
      widgetLoaded.current = true;
    }

    return () => {
      if (containerRef.current && script.parentNode) {
        script.parentNode.removeChild(script);
      }
    };
  }, [botName]);

  // Custom styled button that triggers the Telegram widget
  const handleCustomButtonClick = () => {
    // Find and click the Telegram iframe button
    const iframe = containerRef.current?.querySelector('iframe');
    if (iframe) {
      iframe.click();
    } else {
      // Fallback: open Telegram directly
      window.open(`https://t.me/${botName}?start=auth`, '_blank');
    }
  };

  return (
    <div className="w-full">
      {/* Hidden Telegram widget container */}
      <div ref={containerRef} className="hidden" />
      
      {/* Custom styled button */}
      <button
        onClick={handleCustomButtonClick}
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
    </div>
  );
}
