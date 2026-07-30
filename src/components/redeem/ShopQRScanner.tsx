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

      // Успех: НЕ трогаем onClose (он уводит на главную и убил бы анимацию).
      // onRedeemed сам гасит камеру и показывает общую анимацию успеха на
      // экране забора — как при обычном сканировании бариста.
      onRedeemed();
    } catch {
      toast.error('Нет связи. Проверьте интернет');
      setIsProcessing(false);
    }
  }, [isProcessing, drinkType, isGuestCoffee, onClose, onRedeemed]);

  const DrinkIcon = drinkType === 'coffee' ? Coffee : UtensilsCrossed;

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col overflow-y-auto">
      <div className="safe-area-top" />

      {/* Шапка — в тех же тонах, что остальные экраны приложения */}
      <div className="px-5 pt-2 pb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-foreground font-bold leading-tight" style={{ fontSize: 'clamp(17px,4.8vw,21px)' }}>
            <TT text="Сканируйте QR кофейни" />
          </p>
          <p className="text-muted-foreground text-sm mt-0.5 flex items-center gap-1.5">
            <DrinkIcon size={14} className="text-primary shrink-0" />
            <TT text={isGuestCoffee ? 'Гостевой кофе' : (drinkType === 'coffee' ? 'Списание напитка' : 'Списание ланча')} />
          </p>
        </div>
        <button
          onClick={onClose}
          aria-label="Закрыть"
          className="shrink-0 w-9 h-9 rounded-full bg-secondary text-foreground flex items-center justify-center active:scale-90 transition-transform"
        >
          <X size={18} />
        </button>
      </div>

      {/* Камера квадратная — растягивать её нельзя, поэтому центрируем блок
          «камера + подсказка» по вертикали: подсказка идёт сразу под кадром,
          а свободное место распределяется сверху и снизу, а не зияет внизу. */}
      <div className="flex-1 flex flex-col justify-center min-h-0 px-4">
        <div className="relative rounded-2xl overflow-hidden border border-border">
          <QRScanner onScan={handleScan} isProcessing={isProcessing} allowUsb={false} autoStart />

          {isProcessing && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-background/85 backdrop-blur-sm">
              <Loader2 size={36} className="animate-spin text-primary" />
              <p className="text-foreground font-semibold"><TT text="Списываем…" /></p>
            </div>
          )}
        </div>

        {/* Подсказка — сразу под кадром, а не прижата к нижнему краю экрана */}
        <div className="mt-3 flex items-start gap-2.5 rounded-2xl bg-secondary/60 px-4 py-3">
          <ScanLine size={17} className="shrink-0 mt-0.5 text-accent" />
          <p className="text-muted-foreground leading-snug" style={{ fontSize: 'clamp(12px,3.4vw,14px)' }}>
            <TT text="Наведите камеру на QR-код, который стоит на стойке кофейни. Списание пройдёт автоматически." />
          </p>
        </div>
      </div>

      <div className="safe-area-bottom" />
    </div>
  );
}
