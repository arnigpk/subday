import { QrCode, ScanLine } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useSubscriptionStatus } from '@/hooks/useSubscriptionStatus';
import { useDailyLimit } from '@/hooks/useDailyLimit';
import { useUserStatsContext } from '@/contexts/UserStatsContext';
import { toast } from 'sonner';
import { useLanguage } from '@/contexts/LanguageContext';
import { TT } from '@/components/TT';

interface GetCoffeeButtonProps {
  activeTab: 'coffee' | 'drinks';
}

export function GetCoffeeButton({ activeTab }: GetCoffeeButtonProps) {
  const navigate = useNavigate();
  const { isLoading, activeSubscriptions } = useSubscriptionStatus();
  const { isLimitReached, isLoading: isLimitLoading } = useDailyLimit(activeTab);
  const { stats } = useUserStatsContext();
  const { t } = useLanguage();

  const hasGuestCoffee = stats.guestCoffees > 0 && stats.guestExpiresAt && new Date(stats.guestExpiresAt) > new Date();
  const hasActiveSubForType = activeSubscriptions.some(s => s.subscription_type === activeTab);

  // Гостевой кофе применим только на вкладке «Кофе».
  const guestApplies = hasGuestCoffee && activeTab === 'coffee';
  const noSubForType = !hasActiveSubForType && !guestApplies;
  // Настоящий disabled — только загрузка или исчерпанный дневной лимит.
  // Без подписки кнопки лишь ВЫГЛЯДЯТ неактивными: клик ведёт на страницу подписок.
  const isDisabled = isLoading || isLimitLoading || (hasActiveSubForType && isLimitReached && !hasGuestCoffee);
  const looksInactive = isDisabled || noSubForType;

  // Оба способа ведут на один экран — отличается только то, что там открывается:
  // свой QR для бариста или камера для QR кофейни.
  const go = (openScanner: boolean) => {
    if (isDisabled) return;
    if (noSubForType) {
      toast.info(t('home.pleaseSubscribe'));
      navigate('/packages');
      return;
    }
    const state: Record<string, unknown> = guestApplies
      ? { drinkType: 'coffee', drinkName: 'Кофе', isGuestCoffee: true }
      : { drinkType: activeTab };
    if (openScanner) state.openShopScanner = true;
    navigate('/redeem', { state });
  };

  // Тёплый красно-терракотовый — ближе к красному, но не «тревожный» алый.
  const warm = 'linear-gradient(135deg, hsl(14 82% 52%), hsl(4 74% 44%))';
  const glow = '0 6px 20px hsl(10 80% 45% / 0.35)';

  return (
    <div className="flex w-full gap-2.5 animate-slide-up" style={{ animationDelay: '0.05s' }}>
      {/* Свой QR — его показывают бариста */}
      <button
        onClick={() => go(false)}
        disabled={isDisabled}
        className={`flex-1 min-w-0 rounded-2xl text-white font-bold transition-all duration-200 active:scale-95
          disabled:cursor-not-allowed ${looksInactive ? 'opacity-50' : 'animate-pulse-glow'}`}
        style={{ background: warm, boxShadow: looksInactive ? 'none' : glow, padding: 'clamp(10px,3vw,14px) clamp(6px,2vw,14px)' }}
      >
        <span className="flex flex-col items-center gap-0.5">
          <QrCode style={{ width: 'clamp(22px,6.5vw,28px)', height: 'clamp(22px,6.5vw,28px)' }} strokeWidth={2.4} />
          <span className="truncate max-w-full" style={{ fontSize: 'clamp(14px,4vw,18px)', lineHeight: 1.2 }}>
            <TT text="Ваш QR" />
          </span>
          <span className="truncate max-w-full font-medium opacity-90" style={{ fontSize: 'clamp(9px,2.6vw,11px)', lineHeight: 1.2 }}>
            <TT text="показать бариста" />
          </span>
        </span>
      </button>

      {/* Сканер QR кофейни — второй способ забора */}
      <button
        onClick={() => go(true)}
        disabled={isDisabled}
        className={`flex-1 min-w-0 rounded-2xl font-bold transition-all duration-200 active:scale-95
          disabled:cursor-not-allowed border-2 ${looksInactive ? 'opacity-50' : ''}`}
        style={{
          borderColor: 'hsl(10 78% 48% / 0.55)',
          color: 'hsl(6 72% 44%)',
          background: 'hsl(14 82% 52% / 0.08)',
          padding: 'clamp(10px,3vw,14px) clamp(6px,2vw,14px)',
        }}
      >
        <span className="flex flex-col items-center gap-0.5">
          <ScanLine style={{ width: 'clamp(22px,6.5vw,28px)', height: 'clamp(22px,6.5vw,28px)' }} strokeWidth={2.4} />
          <span className="truncate max-w-full" style={{ fontSize: 'clamp(14px,4vw,18px)', lineHeight: 1.2 }}>
            <TT text="Сканировать" />
          </span>
          <span className="truncate max-w-full font-medium opacity-80" style={{ fontSize: 'clamp(9px,2.6vw,11px)', lineHeight: 1.2 }}>
            <TT text="QR кофейни" />
          </span>
        </span>
      </button>
    </div>
  );
}
