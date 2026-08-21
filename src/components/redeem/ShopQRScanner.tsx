import { useState, useCallback, useEffect, useRef } from 'react';
import { QRScanner } from '@/components/partner/QRScanner';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/components/ui/sonner';
import { X, Loader2, ScanLine, Coffee, UtensilsCrossed, QrCode, Gift, ShieldCheck } from 'lucide-react';
import { TT } from '@/components/TT';
import { nativeScanQR, isNativeScanReady } from '@/lib/nativeScan';

/** Пауза после ошибки списания — чтобы человек успел прочитать сообщение. */
const ERROR_PAUSE_MS = 1600;

interface Props {
  drinkType: 'coffee' | 'drinks';
  isGuestCoffee: boolean;
  /** Остаток напитков — показываем, что именно спишется. */
  remaining?: number;
  /** Переключиться на свой QR (для бариста), не уходя с экрана забора. */
  onShowMyQR?: () => void;
  onClose: () => void;
  /**
   * Вызывается при успешном списании (на случай, если realtime не долетел).
   * shopName — название кофейни, чей QR отсканирован (из токена, а не из
   * геолокации), чтобы экран успеха показал именно её.
   */
  onRedeemed: (shopName?: string) => void;
}

/**
 * Второй способ забора: гость сам сканирует QR, который стоит в кофейне.
 * Списание делает тот же серверный обработчик, что и при сканировании бариста —
 * разница лишь в том, что кофейню мы берём из секретного токена в QR, а списываем
 * строго у себя. Успех показывается общей анимацией (realtime), как и раньше.
 */
export function ShopQRScanner({ drinkType, isGuestCoffee, remaining, onShowMyQR, onClose, onRedeemed }: Props) {
  const [isProcessing, setIsProcessing] = useState(false);
  // Системный сканер (ML Kit) читает код заметно увереннее — под углом, с бликами,
  // в полумраке. Если его на платформе нет (веб, миниапп, Android без модуля), сразу
  // и молча работает привычная камера. Параллельно они не запускаются никогда.
  const [webFallback, setWebFallback] = useState(!isNativeScanReady());
  // Системный сканер был доступен, но не открылся. Сами камеру не поднимаем —
  // предлагаем кнопку, чтобы не оказаться с двумя сканерами разом.
  const [nativeFailed, setNativeFailed] = useState(false);

  // Возвращает true, если списание прошло. false — была ошибка, и вызывающий
  // цикл должен снова открыть сканер: человек остаётся в сканировании, а не
  // выпадает на запасную камеру.
  const handleScan = useCallback(async (raw: string): Promise<boolean> => {
    if (isProcessing) return false;

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
      return false;
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
        return false;
      }
      if (data?.error) {
        toast.error(data.error);
        setIsProcessing(false);
        return false;
      }

      // Успех: НЕ трогаем onClose (он уводит на главную и убил бы анимацию).
      // onRedeemed сам гасит камеру и показывает общую анимацию успеха на
      // экране забора — как при обычном сканировании бариста. Передаём имя
      // кофейни из ответа сервера, чтобы успех показал именно её.
      onRedeemed(typeof data?.shopName === 'string' ? data.shopName : undefined);
      return true;
    } catch {
      toast.error('Нет связи. Проверьте интернет');
      setIsProcessing(false);
      return false;
    }
  }, [isProcessing, drinkType, isGuestCoffee, onClose, onRedeemed]);

  // Системный сканер работает циклом, пока человек не уйдёт с экрана:
  //   прочитан + списано → экран сам уходит на анимацию успеха;
  //   прочитан, но ошибка → показали её и СНОВА открыли системный сканер
  //                          (раньше здесь подхватывалась запасная камера);
  //   закрыли окно         → человек передумал, закрываем экран забора;
  //   сбой плагина         → показываем кнопку «Открыть сканер», сами ничего
  //                          не поднимаем — параллельных камер быть не должно.
  const handleScanRef = useRef(handleScan);
  useEffect(() => { handleScanRef.current = handleScan; });

  const startedRef = useRef(false);
  useEffect(() => {
    if (webFallback || startedRef.current) return;
    startedRef.current = true;
    let stopped = false;
    (async () => {
      while (!stopped) {
        const res = await nativeScanQR();
        if (stopped) return;
        if (res.status === 'cancelled') { onClose(); return; }
        if (res.status === 'unavailable') { setNativeFailed(true); return; }
        const ok = await handleScanRef.current(res.value);
        if (stopped || ok) return;
        // Ошибка списания: даём прочитать сообщение и открываем сканер заново.
        await new Promise(r => setTimeout(r, ERROR_PAUSE_MS));
      }
    })();
    return () => { stopped = true; };
    // onClose стабилен у вызывающего экрана; перезапуск цикла нам не нужен.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [webFallback]);

  const DrinkIcon = drinkType === 'coffee' ? Coffee : UtensilsCrossed;

  // Пока поднимается системный сканер, своего экрана рисовать нечего: поверх всё
  // равно встанет камера во весь экран. Раньше здесь на миг успевал показаться
  // светлый фон с лоадером — та самая белая вспышка при открытии сканера.
  // Гасим прозрачностью, а не visibility/display: слой должен остаться кликабельным,
  // чтобы случайные нажатия не проваливались на экран под ним. Если системный
  // сканер не откроется, nativeFailed вернёт и фон, и кнопку запасной камеры.
  const nativeOpening = !webFallback && !nativeFailed;

  return (
    <div className={`fixed inset-0 z-50 bg-background flex flex-col overflow-y-auto ${
      nativeOpening ? 'opacity-0' : ''
    }`}>
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
        {/* Полоска над кадром: что именно спишется и сколько осталось —
            заполняет пустоту между заголовком и камерой полезным. */}
        <div className="mb-3 flex items-center gap-2.5 rounded-2xl bg-secondary/60 px-4 py-3">
          {isGuestCoffee
            ? <Gift size={17} className="shrink-0 text-accent" />
            : <DrinkIcon size={17} className="shrink-0 text-primary" />}
          <div className="min-w-0 flex-1">
            <p className="text-foreground font-semibold leading-tight" style={{ fontSize: 'clamp(13px,3.7vw,15px)' }}>
              <TT text={isGuestCoffee
                ? 'Спишется гостевой кофе'
                : (drinkType === 'coffee' ? 'Спишется 1 кофе' : 'Спишется 1 ланч')} />
            </p>
            {typeof remaining === 'number' && !isGuestCoffee && (
              <p className="text-muted-foreground leading-snug mt-0.5" style={{ fontSize: 'clamp(11px,3.1vw,13px)' }}>
                <TT text="Осталось" />: <b className="text-foreground">{remaining}</b>
              </p>
            )}
          </div>
          <span className="shrink-0 inline-flex items-center gap-1 text-accent" style={{ fontSize: 'clamp(10px,2.9vw,12px)' }}>
            <ShieldCheck size={13} />
            <TT text="Списание защищено" />
          </span>
        </div>

        <div className="relative rounded-2xl overflow-hidden border border-border">
          {/* Веб-сканер монтируем ТОЛЬКО в режиме отката: иначе на нативе рядом с
              системным сканером стартовала бы вторая камера (конфликт устройства). */}
          {webFallback ? (
            <QRScanner onScan={handleScan} isProcessing={isProcessing} autoStart />
          ) : nativeFailed ? (
            <div className="aspect-square w-full flex flex-col items-center justify-center gap-4 bg-secondary/40 px-6">
              <ScanLine size={36} className="text-muted-foreground" />
              <p className="text-muted-foreground text-center text-sm">
                <TT text="Сканер не открылся" />
              </p>
              <button
                onClick={() => setWebFallback(true)}
                className="w-full max-w-[220px] rounded-xl bg-primary text-primary-foreground font-semibold py-3 active:scale-95 transition-transform"
              >
                <TT text="Открыть сканер" />
              </button>
            </div>
          ) : (
            <div className="aspect-square w-full flex flex-col items-center justify-center gap-3 bg-secondary/40">
              <Loader2 size={32} className="animate-spin text-primary" />
              <p className="text-muted-foreground text-sm"><TT text="Открываем камеру…" /></p>
            </div>
          )}

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

        {/* Второй способ: показать свой QR бариста — та же стилистика, что на главной */}
        {onShowMyQR && (
          <button
            onClick={onShowMyQR}
            disabled={isProcessing}
            className="mt-3 w-full rounded-2xl font-bold bg-accent text-accent-foreground shadow-glow active:scale-95 transition-all duration-200 disabled:opacity-50"
            style={{ padding: 'clamp(9px,2.6vw,13px) clamp(7px,2.2vw,14px)' }}
          >
            <span className="flex items-center justify-center gap-2">
              <span className="shrink-0 flex items-center">
                <QrCode style={{ width: 'clamp(19px,5.2vw,24px)', height: 'clamp(19px,5.2vw,24px)' }} strokeWidth={2.5} />
              </span>
              <span className="min-w-0 flex flex-col items-start">
                <span className="truncate max-w-full" style={{ fontSize: 'clamp(13px,3.8vw,17px)', lineHeight: 1.15 }}>
                  <TT text="Ваш QR" />
                </span>
                <span className="truncate max-w-full font-medium opacity-75" style={{ fontSize: 'clamp(8.5px,2.4vw,11px)', lineHeight: 1.15 }}>
                  <TT text="показать бариста" />
                </span>
              </span>
            </span>
          </button>
        )}
      </div>

      <div className="safe-area-bottom" />
    </div>
  );
}
