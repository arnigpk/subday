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
  const { isLimitReached } = useDailyLimit(activeTab);
  const { stats } = useUserStatsContext();
  const { t } = useLanguage();

  const hasGuestCoffee = stats.guestCoffees > 0 && stats.guestExpiresAt && new Date(stats.guestExpiresAt) > new Date();
  const hasActiveSubForType = activeSubscriptions.some(s => s.subscription_type === activeTab);

  // Гостевой кофе применим только на вкладке «Кофе».
  const guestApplies = hasGuestCoffee && activeTab === 'coffee';
  const noSubForType = !hasActiveSubForType && !guestApplies;
  // Кнопки активны СРАЗУ после открытия: не ждём загрузку дневного лимита
  // (статус подписки — кеш-первый). Блокируем только когда лимит ТОЧНО исчерпан;
  // на скан сервер всё равно перепроверит, так что риска «пропустить лимит» нет.
  const isDisabled = isLoading || (hasActiveSubForType && isLimitReached && !hasGuestCoffee);
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

  // Компактная раскладка: иконка слева, название и пояснение — колонкой справа.
  // Так кнопка ниже, чем при вертикальной укладке, а текст остаётся читаемым.
  const box = 'flex-1 min-w-0 rounded-2xl font-bold transition-all duration-200 active:scale-95 disabled:cursor-not-allowed';
  const pad = { padding: 'clamp(9px,2.6vw,13px) clamp(7px,2.2vw,14px)' };
  const iconSize = { width: 'clamp(19px,5.2vw,24px)', height: 'clamp(19px,5.2vw,24px)' };
  const titleSize = { fontSize: 'clamp(13px,3.8vw,17px)', lineHeight: 1.15 };
  const hintSize = { fontSize: 'clamp(8.5px,2.4vw,11px)', lineHeight: 1.15 };

  return (
    <div className="flex w-full gap-2.5 animate-slide-up" style={{ animationDelay: '0.05s' }}>
      {/* Свой QR — основной способ, фирменный лаймовый акцент */}
      <button
        onClick={() => go(false)}
        disabled={isDisabled}
        className={`${box} bg-accent text-accent-foreground ${looksInactive ? 'opacity-50' : 'shadow-glow animate-pulse-glow'}`}
        style={pad}
      >
        <span className="flex items-center justify-center gap-2">
          <ScanIconSlot><QrCode style={iconSize} strokeWidth={2.5} /></ScanIconSlot>
          <span className="min-w-0 flex flex-col items-start">
            <span className="truncate max-w-full" style={titleSize}><TT text="Ваш QR" /></span>
            <span className="truncate max-w-full font-medium opacity-75" style={hintSize}>
              <TT text="показать бариста" />
            </span>
          </span>
        </span>
      </button>

      {/* Сканер QR кофейни — второй способ, выделен красным */}
      <button
        onClick={() => go(true)}
        disabled={isDisabled}
        className={`${box} border-2 ${looksInactive ? 'opacity-50' : ''}`}
        style={{
          ...pad,
          borderColor: 'hsl(4 74% 50% / 0.5)',
          color: 'hsl(4 72% 45%)',
          background: 'hsl(4 74% 50% / 0.08)',
        }}
      >
        <span className="flex items-center justify-center gap-2">
          <ScanIconSlot><ScanLine style={iconSize} strokeWidth={2.5} /></ScanIconSlot>
          <span className="min-w-0 flex flex-col items-start">
            <span className="truncate max-w-full" style={titleSize}><TT text="Сканировать" /></span>
            <span className="truncate max-w-full font-medium opacity-70" style={hintSize}>
              <TT text="QR кофейни" />
            </span>
          </span>
        </span>
      </button>
    </div>
  );
}

/** Иконка не должна сжиматься, когда текст длинный (казахский/английский). */
function ScanIconSlot({ children }: { children: React.ReactNode }) {
  return <span className="shrink-0 flex items-center">{children}</span>;
}
