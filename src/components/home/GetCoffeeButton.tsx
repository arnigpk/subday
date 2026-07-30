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

  // Check if user has active subscription for the current tab type
  const hasActiveSubForType = activeSubscriptions.some(s => s.subscription_type === activeTab);

  // Гостевой кофе применим только на вкладке «Кофе».
  const guestApplies = hasGuestCoffee && activeTab === 'coffee';
  const noSubForType = !hasActiveSubForType && !guestApplies;
  // Настоящий disabled — только загрузка или исчерпанный дневной лимит.
  // Без подписки кнопки лишь ВЫГЛЯДЯТ неактивными: клик ведёт на страницу подписок.
  const isDisabled = isLoading || isLimitLoading || (hasActiveSubForType && isLimitReached && !hasGuestCoffee);
  const looksInactive = isDisabled || noSubForType;

  // Оба способа забора ведут на один экран — отличается только то, что там
  // открывается: свой QR для бариста или камера для QR кофейни.
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

  // Размеры тянутся от ширины экрана (clamp), поэтому кнопки одинаково аккуратны
  // и на узких телефонах, и на планшетах — без «прыжков» и обрезанного текста.
  const base =
    'flex-1 min-w-0 btn-accent flex items-center justify-center gap-2 ' +
    'disabled:opacity-50 disabled:cursor-not-allowed';

  return (
    <div className="flex w-full gap-2 animate-slide-up" style={{ animationDelay: '0.05s' }}>
      <button
        onClick={() => go(false)}
        disabled={isDisabled}
        className={`${base} ${looksInactive ? 'opacity-50' : 'animate-pulse-glow'}`}
        style={{ fontSize: 'clamp(14px, 4.2vw, 20px)', paddingInline: 'clamp(8px, 2.5vw, 20px)' }}
      >
        <QrCode style={{ width: 'clamp(20px, 6vw, 28px)', height: 'clamp(20px, 6vw, 28px)' }} strokeWidth={2.5} className="shrink-0" />
        <span className="truncate"><TT text="Ваш QR" /></span>
      </button>

      <button
        onClick={() => go(true)}
        disabled={isDisabled}
        className={`${base} ${looksInactive ? 'opacity-50' : ''}`}
        style={{ fontSize: 'clamp(14px, 4.2vw, 20px)', paddingInline: 'clamp(8px, 2.5vw, 20px)' }}
      >
        <ScanLine style={{ width: 'clamp(20px, 6vw, 28px)', height: 'clamp(20px, 6vw, 28px)' }} strokeWidth={2.5} className="shrink-0" />
        <span className="truncate"><TT text="Сканировать" /></span>
      </button>
    </div>
  );
}
