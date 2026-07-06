import { LogIn } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';

interface GuestLoginBannerProps {
  onLogin: () => void;
}

// Плавающая плашка для гостя: видимое приглашение войти/зарегистрироваться.
// Показывается только в гостевом режиме (просмотр без входа).
export function GuestLoginBanner({ onLogin }: GuestLoginBannerProps) {
  const { t } = useLanguage();
  return (
    <div className="fixed top-0 inset-x-0 z-[60] safe-area-top pointer-events-none">
      {/* animate-pulse — мягкое «дыхание» прозрачностью, чтобы плашка не давила на глаза */}
      <div className="mx-auto max-w-md m-2 flex items-center justify-between gap-3 rounded-xl bg-primary/80 text-primary-foreground shadow-lg px-4 py-2 pointer-events-auto animate-pulse">
        <span className="text-sm font-medium truncate">{t('auth.guestBanner')}</span>
        <button
          type="button"
          onClick={onLogin}
          className="shrink-0 flex items-center gap-1.5 rounded-lg bg-primary-foreground/15 hover:bg-primary-foreground/25 transition-colors px-3 py-1.5 text-sm font-semibold"
        >
          <LogIn className="w-4 h-4" />
          {t('auth.loginRegister')}
        </button>
      </div>
    </div>
  );
}
