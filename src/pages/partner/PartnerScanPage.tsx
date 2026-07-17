import { useState, useEffect, useRef } from 'react';
import { PartnerLayout } from '@/components/partner/PartnerLayout';
import { QRScanner } from '@/components/partner/QRScanner';
import { usePartnerAuth } from '@/hooks/usePartnerAuth';
import { supabase } from '@/integrations/supabase/client';
import { Check, X, AlertTriangle, MapPin } from 'lucide-react';
import { useSuccessSound } from '@/hooks/useSuccessSound';
import { useVibration } from '@/hooks/useVibration';
import { BaristaAddressDialog } from '@/components/partner/BaristaAddressDialog';

interface ScanResult {
  success: boolean;
  message: string;
  customerName?: string;
  drinkName?: string;
  remaining?: number;
}

export default function PartnerScanPage() {
  const { shopId } = usePartnerAuth();
const isDesktop = !/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)
  && !(window as any).Capacitor?.isNativePlatform?.()
  && !(window as any).Telegram?.WebApp?.initData;
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [showConfetti, setShowConfetti] = useState(false);
  const { playSuccessSound } = useSuccessSound();
  const { vibrateSuccess } = useVibration();
  const autoResetRef = useRef<NodeJS.Timeout | null>(null);
  const isProcessingRef = useRef(false);
  const processingStartRef = useRef<number>(0);

  // Адрес/касса смены — для маршрутизации заказа iiko. Спрашиваем МИНИМАЛЬНО:
  // 1 адрес → берём сам, без вопроса; несколько → спрашиваем ОДИН раз и запоминаем
  // per-shop в localStorage. Выбор привязан к КОНКРЕТНОЙ кофейне (чинит баг, когда
  // при смене кофейни подтягивался чужой адрес).
  const [shopAddresses, setShopAddresses] = useState<string[]>([]);
  const [shiftAddress, setShiftAddress] = useState<string | null>(null);
  const [showAddrDialog, setShowAddrDialog] = useState(false);

  const addrKey = (sid: string) => `barista_addr_${sid}`;

  // Запоминаем выбор per-shop + обновляем barista_shifts (серверный фолбэк/«Моя смена»).
  const persistAddress = (sid: string, addr: string) => {
    try { localStorage.setItem(addrKey(sid), addr); } catch { /* ignore */ }
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      supabase.from('barista_shifts').upsert({
        user_id: user.id, shop_id: sid, address: addr,
        started_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      }, { onConflict: 'user_id' }).then(() => {});
    });
  };

  useEffect(() => {
    if (!shopId) return;
    let cancelled = false;
    (async () => {
      const { data: shop } = await supabase.from('shops').select('addresses, address').eq('id', shopId).maybeSingle();
      if (cancelled) return;
      const addrs = shop?.addresses?.length ? shop.addresses : (shop?.address ? [shop.address] : []);
      setShopAddresses(addrs);

      // Запомненный выбор именно для ЭТОЙ кофейни (и он всё ещё валиден).
      let remembered: string | null = null;
      try { remembered = localStorage.getItem(addrKey(shopId)); } catch { /* ignore */ }
      if (remembered && addrs.includes(remembered)) { setShiftAddress(remembered); return; }

      if (addrs.length <= 1) {
        const only = addrs[0] || null;
        setShiftAddress(only);
        if (only) persistAddress(shopId, only); // фиксируем, чтобы больше не трогать
      } else {
        setShiftAddress(null);
        setShowAddrDialog(true); // несколько адресов, выбора ещё нет — спросим один раз
      }
    })();
    return () => { cancelled = true; };
  }, [shopId]);

  useEffect(() => {
    if (result) {
      autoResetRef.current = setTimeout(() => {
        setResult(null);
        isProcessingRef.current = false;
        setIsProcessing(false);
      }, 2500);
    }
    return () => {
      if (autoResetRef.current) clearTimeout(autoResetRef.current);
    };
  }, [result]);

  // Принудительный сброс зависшего состояния при возврате на вкладку
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        // Если вкладка снова активна, а обработка висит без результата — сбрасываем
        if (isProcessingRef.current && !result) {
          isProcessingRef.current = false;
          setIsProcessing(false);
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [result]);

  const resetProcessing = () => {
    isProcessingRef.current = false;
    setIsProcessing(false);
  };

  const handleScan = async (qrData: string) => {
    if (isProcessingRef.current) {
      const stuck = Date.now() - processingStartRef.current > 10_000;
      if (!stuck) return;
    }
    if (!shopId) return;
    // Мультиадрес: не сканируем, пока бариста не подтвердил адрес/кассу.
    if (shopAddresses.length > 1 && !shiftAddress) { setShowAddrDialog(true); return; }
    isProcessingRef.current = true;
    processingStartRef.current = Date.now();
    setIsProcessing(true);
    setResult(null);

    try {
      let data;
      try {
        data = JSON.parse(qrData);
      } catch {
        setResult({ success: false, message: 'Неверный формат QR-кода' });
        resetProcessing();
        return;
      }

      if (data.type === 'subday_preorder') {
        // Единый серверный путь: валидация + выдача + падение заказа в POS по тарифу
        // предзаказа (partner-scan-preorder). Работает и с камеры, и с USB-сканера.
        try {
          const { data: response, error } = await supabase.functions.invoke('partner-scan-preorder', {
            body: { qrCode: data.qrCode, shopId },
          });
          if (error) {
            setResult({ success: false, message: 'Ошибка при обработке. Попробуйте ещё раз.' });
          } else if (response?.error) {
            setResult({ success: false, message: response.error });
          } else if (response?.success === true) {
            setResult({ success: true, message: 'Предзаказ выдан!', drinkName: response.drinkName });
            setShowConfetti(true);
            playSuccessSound();
            vibrateSuccess();
            setTimeout(() => setShowConfetti(false), 2000);
          } else {
            setResult({ success: false, message: 'Выдача не подтверждена. Попробуйте ещё раз.' });
          }
        } catch (err) {
          console.error('Preorder scan error:', err);
          setResult({ success: false, message: 'Ошибка обработки предзаказа' });
        }
        resetProcessing();
        return;
      }

      if (data.type !== 'subday_redeem') {
        setResult({ success: false, message: 'Это не QR-код SubDay' });
        resetProcessing();
        return;
      }

      if (data.shopId !== shopId) {
        setResult({ success: false, message: 'Этот QR принадлежит другой кофейне' });
        resetProcessing();
        return;
      }

      // No client-clock expiry check here. The QR timestamp is set by the customer's
      // device and was previously compared against the partner's device clock — any
      // skew between the two phones produced false "QR expired" errors even for a
      // freshly refreshed code (intermittently, depending on where in the 60s cycle
      // the scan landed). The server (partner-scan-qr) already validates role, shop,
      // balance, daily limit and frozen state, and the cup is always deducted from the
      // customer's own paid balance — so the timestamp added no real protection.
      // Redemption is now reliable regardless of the two devices' clocks.

      // Таймаут, чтобы на слабом/мёртвом интернете спиннер не висел вечно.
      const invokePromise = supabase.functions.invoke('partner-scan-qr', {
        body: {
          userId: data.userId,
          shopId: data.shopId,
          drinkType: data.drinkType,
          isGuestCoffee: data.isGuestCoffee || false,
          address: shiftAddress || undefined, // касса смены → маршрутизация заказа iiko
        },
      });
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('scan-timeout')), 15000),
      );
      const { data: response, error } = await Promise.race([invokePromise, timeoutPromise]) as Awaited<typeof invokePromise>;

      if (error) {
        console.error('Edge function error:', error);
        setResult({ success: false, message: 'Ошибка при обработке. Попробуйте ещё раз.' });
        resetProcessing();
        return;
      }

      // Жёсткая проверка ответа: успехом считаем ТОЛЬКО явный success: true
      if (!response || typeof response !== 'object') {
        console.error('Empty/invalid response:', response);
        setResult({ success: false, message: 'Нет ответа от сервера. Попробуйте ещё раз.' });
        resetProcessing();
        return;
      }

      if (response.error) {
        setResult({ success: false, message: response.error });
      } else if (response.success === true) {
        setResult({
          success: true,
          message: 'Успешно списано!',
          customerName: response.customerName,
          drinkName: response.drinkName,
          remaining: response.remaining,
        });
        setShowConfetti(true);
        playSuccessSound();
        vibrateSuccess();
        setTimeout(() => setShowConfetti(false), 2000);
      } else {
        // Сервер ответил, но без явного успеха — НЕ показываем ложный успех
        console.error('Unexpected response shape:', response);
        setResult({ success: false, message: 'Списание не подтверждено. Попробуйте ещё раз.' });
      }
    } catch (error) {
      console.error('Scan processing error:', error);
      const isTimeout = error instanceof Error && error.message === 'scan-timeout';
      setResult({
        success: false,
        message: isTimeout
          ? 'Слабое соединение — попробуйте ещё раз'
          : 'Произошла ошибка. Попробуйте ещё раз.',
      });
    } finally {
      resetProcessing();
    }
  };

  return (
    <PartnerLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-center gap-3 px-4 pt-4">
  <h2 className="text-xl font-bold text-foreground text-center">
    Сканер QR-кодов
  </h2>
  {isDesktop && (
    <button
      onClick={() => window.location.reload()}
      className="p-2 rounded-lg bg-secondary hover:bg-muted transition-colors"
      title="Обновить страницу"
    >
      Обновить сканер!
    </button>
  )}
</div>
        {/* Адрес/касса текущей смены — виден баристе, можно сменить (мультиадрес) */}
        {shiftAddress && (
          <div className="px-4">
            <div className="flex items-center gap-2 text-sm bg-secondary/50 rounded-xl px-3 py-2">
              <MapPin size={15} className="text-primary shrink-0" />
              <span className="text-foreground truncate flex-1">{shiftAddress}</span>
              {shopAddresses.length > 1 && (
                <button onClick={() => setShowAddrDialog(true)} className="text-xs text-primary font-medium shrink-0">Сменить</button>
              )}
            </div>
          </div>
        )}
        <div className="px-4 relative">
          <QRScanner onScan={handleScan} isProcessing={isProcessing || result !== null} />
          {result && (
            <div className="absolute inset-0 flex items-center justify-center z-10">
              <div className="bg-background/95 backdrop-blur-sm rounded-2xl p-6 mx-4 w-full max-w-sm shadow-xl animate-scale-in">
                {result.success ? (
                  <SuccessResult result={result} showConfetti={showConfetti} />
                ) : (
                  <ErrorResult result={result} />
                )}
              </div>
            </div>
          )}
        </div>
        <div className="flex items-start gap-3 p-4 mx-4 bg-amber-500/10 rounded-xl">
          <AlertTriangle size={20} className="text-amber-500 shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-medium text-foreground mb-1">Важно!</p>
            <p className="text-muted-foreground">
              QR-код действителен 1 минуту. Убедитесь, что клиент показывает свежий код.
            </p>
          </div>
        </div>
      </div>

      {shopId && showAddrDialog && (
        <BaristaAddressDialog
          open={showAddrDialog}
          addresses={shopAddresses}
          shopId={shopId}
          onSelect={(addr) => {
            setShiftAddress(addr);
            setShowAddrDialog(false);
            // Диалог уже пишет barista_shifts; здесь фиксируем выбор per-shop локально,
            // чтобы больше не спрашивать при повторных заходах в сканер.
            try { localStorage.setItem(addrKey(shopId), addr); } catch { /* ignore */ }
          }}
        />
      )}
    </PartnerLayout>
  );
}

function SuccessResult({ result, showConfetti }: { result: ScanResult; showConfetti: boolean }) {
  return (
    <div className="flex flex-col items-center gap-4 relative">
      {showConfetti && (
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          {Array.from({ length: 12 }).map((_, i) => (
            <div
              key={i}
              className="absolute animate-confetti"
              style={{
                left: `${Math.random() * 100}%`,
                top: '50%',
                animationDelay: `${Math.random() * 0.5}s`,
                fontSize: `${Math.random() * 16 + 10}px`,
              }}
            >
              {['☕', '✨', '🎉', '⭐'][Math.floor(Math.random() * 4)]}
            </div>
          ))}
        </div>
      )}
      <div className="w-20 h-20 rounded-full bg-accent flex items-center justify-center shadow-glow animate-pop">
        <Check size={40} strokeWidth={3} className="text-accent-foreground" />
      </div>
      <div className="text-center space-y-1">
        <p className="text-xl font-black text-accent">Успешно!</p>
        {result.customerName && (
          <p className="text-sm text-muted-foreground">{result.customerName}</p>
        )}
        {result.drinkName && (
          <p className="text-sm font-semibold text-foreground">{result.drinkName}</p>
        )}
      </div>
    </div>
  );
}

function ErrorResult({ result }: { result: ScanResult }) {
  return (
    <div className="flex flex-col items-center gap-4">
      <div className="w-20 h-20 rounded-full bg-destructive/20 flex items-center justify-center animate-pop">
        <X size={40} strokeWidth={3} className="text-destructive" />
      </div>
      <div className="text-center space-y-1">
        <p className="text-xl font-bold text-destructive">Ошибка</p>
        <p className="text-sm text-muted-foreground">{result.message}</p>
      </div>
    </div>
  );
}