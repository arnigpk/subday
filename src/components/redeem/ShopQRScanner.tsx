import { useState, useCallback } from 'react';
import { QRScanner } from '@/components/partner/QRScanner';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/components/ui/sonner';
import { X, Loader2, ScanLine } from 'lucide-react';
import { TT } from '@/components/TT';

interface Props {
  drinkType: 'coffee' | 'drinks';
  isGuestCoffee: boolean;
  onClose: () => void;
  /** вызывается при успешном списании (на случай, если realtime не долетел) */
  onRedeemed: () => void;
}

/**
 * Второй способ забора: гость сам сканирует QR, который висит в кофейне.
 * Списание делает тот же серверный обработчик, что и при сканировании бариста —
 * разница лишь в том, что кофейню мы берём из секретного токена в QR, а списываем
 * строго у себя. Успех показывается общей анимацией (realtime), как и раньше.
 */
export function ShopQRScanner({ drinkType, isGuestCoffee, onClose, onRedeemed }: Props) {
  const [isProcessing, setIsProcessing] = useState(false);

  const handleScan = useCallback(async (raw: string) => {
    if (isProcessing) return;

    // Достаём токен: поддерживаем и JSON-формат, и «голый» uuid, и ссылку —
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

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      <div className="safe-area-top" />
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <ScanLine size={18} className="text-primary" />
          <span className="font-semibold text-foreground"><TT text="Сканируйте QR кофейни" /></span>
        </div>
        <button onClick={onClose} aria-label="Закрыть" className="p-2 -mr-2 text-muted-foreground hover:text-foreground">
          <X size={22} />
        </button>
      </div>

      <div className="flex-1 min-h-0">
        <QRScanner onScan={handleScan} isProcessing={isProcessing} />
      </div>

      <div className="px-5 py-4 text-center safe-area-bottom">
        {isProcessing ? (
          <p className="text-sm text-foreground flex items-center justify-center gap-2">
            <Loader2 size={16} className="animate-spin text-primary" />
            <TT text="Списываем…" />
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">
            <TT text="Наведите камеру на QR-код, который стоит на стойке кофейни" />
          </p>
        )}
      </div>
    </div>
  );
}
