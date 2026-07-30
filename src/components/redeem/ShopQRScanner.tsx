import { useState, useCallback } from 'react';
import { QRScanner } from '@/components/partner/QRScanner';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/components/ui/sonner';
import { X, Loader2, ScanLine, Coffee, UtensilsCrossed } from 'lucide-react';
import { TT } from '@/components/TT';

interface Props {
  drinkType: 'coffee' | 'drinks';
  isGuestCoffee: boolean;
  onClose: () => void;
  /** вызывается при успешном списании (на случай, если realtime не долетел) */
  onRedeemed: () => void;
}

/**
 * Второй способ забора: гость сам сканирует QR, который стоит в кофейне.
 * Списание делает тот же серверный обработчик, что и при сканировании бариста —
 * разница лишь в том, что кофейню мы берём из секретного токена в QR, а списываем
 * строго у себя. Успех показывается общей анимацией (realtime), как и раньше.
 */
export function ShopQRScanner({ drinkType, isGuestCoffee, onClose, onRedeemed }: Props) {
  const [isProcessing, setIsProcessing] = useState(false);

  const handleScan = useCallback(async (raw: string) => {
    if (isProcessing) return;

    // Достаём токен: поддерживаем JSON-формат, «голый» uuid и ссылку —
    // чтобы код читался, даже если кофейня распечатает его иначе.
    let token: string | null = null;
    const uuidRe = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
    try {
      const parsed = JSON.parse(raw);
      if (parsed?.t === 'subday_shop' && typeof parsed.k === 'string') token = parsed.k;
    } catch {
      const m = raw.match(uuidRe);
      if (m) token = m[0];
    }
    if (!token) {
      toast.error('Это не QR-код кофейни subday');
      return;
    }

    setIsProcessing(true);
    try {
      const { data, error } = await supabase.functions.invoke('partner-scan-qr', {
        body: { shopToken: token, drinkType, isGuestCoffee },
      });

      if (error) {
        let msg = 'Не удалось списать. Попробуйте ещё раз';
        try {
          const b = await (error as { context?: { json?: () => Promise<{ error?: string }> } }).context?.json?.();
          if (b?.error) msg = b.error;
        } catch { /* оставим общий текст */ }
        toast.error(msg);
        setIsProcessing(false);
        return;
      }
      if (data?.error) {
        toast.error(data.error);
        setIsProcessing(false);
        return;
      }

      // Успех: закрываем камеру. Анимацию покажет общий обработчик списания.
      onClose();
      onRedeemed();
    } catch {
      toast.error('Нет связи. Проверьте интернет');
      setIsProcessing(false);
    }
  }, [isProcessing, drinkType, isGuestCoffee, onClose, onRedeemed]);

  const DrinkIcon = drinkType === 'coffee' ? Coffee : UtensilsCrossed;

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: 'hsl(28 20% 8%)' }}>
      <div className="safe-area-top" />

      {/* Шапка */}
      <div className="px-5 pt-2 pb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-white font-bold leading-tight" style={{ fontSize: 'clamp(18px,5vw,22px)' }}>
            <TT text="Сканируйте QR кофейни" />
          </p>
          <p className="text-white/55 text-sm mt-0.5 flex items-center gap-1.5">
            <DrinkIcon size={14} />
            <TT text={isGuestCoffee ? 'Гостевой кофе' : (drinkType === 'coffee' ? 'Списание напитка' : 'Списание ланча')} />
          </p>
        </div>
        <button
          onClick={onClose}
          aria-label="Закрыть"
          className="shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-white/80 active:scale-90 transition-transform"
          style={{ background: 'hsl(0 0% 100% / 0.12)' }}
        >
          <X size={20} />
        </button>
      </div>

      {/* Камера в скруглённой рамке */}
      <div className="flex-1 min-h-0 px-4">
        <div className="relative w-full h-full rounded-3xl overflow-hidden" style={{ background: 'hsl(28 20% 12%)' }}>
          <QRScanner onScan={handleScan} isProcessing={isProcessing} allowUsb={false} />

          {isProcessing && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3"
                 style={{ background: 'hsl(28 20% 8% / 0.82)', backdropFilter: 'blur(3px)' }}>
              <Loader2 size={38} className="animate-spin" style={{ color: 'hsl(14 82% 55%)' }} />
              <p className="text-white font-semibold"><TT text="Списываем…" /></p>
            </div>
          )}
        </div>
      </div>

      {/* Подсказка */}
      <div className="px-6 pt-4 pb-5 safe-area-bottom">
        <div className="flex items-start gap-2.5 rounded-2xl px-4 py-3" style={{ background: 'hsl(0 0% 100% / 0.07)' }}>
          <ScanLine size={17} className="shrink-0 mt-0.5" style={{ color: 'hsl(14 82% 58%)' }} />
          <p className="text-white/70 leading-snug" style={{ fontSize: 'clamp(12px,3.4vw,14px)' }}>
            <TT text="Наведите камеру на QR-код, который стоит на стойке кофейни. Списание пройдёт автоматически." />
          </p>
        </div>
      </div>
    </div>
  );
}
