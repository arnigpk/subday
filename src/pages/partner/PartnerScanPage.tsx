import { useState, useEffect, useRef } from 'react';
import { PartnerLayout } from '@/components/partner/PartnerLayout';
import { ShopQRCode } from '@/components/partner/ShopQRCode';
import { QRScanner } from '@/components/partner/QRScanner';
import { usePartnerAuth } from '@/hooks/usePartnerAuth';
import { supabase } from '@/integrations/supabase/client';
import { Check, X, MapPin, QrCode, Loader2 } from 'lucide-react';
import { useSuccessSound } from '@/hooks/useSuccessSound';
import { useVibration } from '@/hooks/useVibration';
import { BaristaAddressDialog } from '@/components/partner/BaristaAddressDialog';
import { nativeScanQR, isNativeScanReady, isNativeScanOpen } from '@/lib/nativeScan';

interface ScanResult {
  success: boolean;
  message: string;
  customerName?: string;
  drinkName?: string;
  remaining?: number;
}

export default function PartnerScanPage() {
  const { shopId, isPartner } = usePartnerAuth();
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
  const [showShopQR, setShowShopQR] = useState(false);
  // Системный сканер (ML Kit) — только в приложении: читает увереннее (под углом,
  // с бликами, в полумраке). Стартует сам, отдельной кнопки нет. Если он недоступен
  // или бариста его закрыл — молча включается встроенная камера, как раньше.
  const [webFallback, setWebFallback] = useState(!isNativeScanReady());
  const nativeLoopRef = useRef(false);
  const nativeStopRef = useRef(false);

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
        // предзаказа (partner-scan-preorder). Единый путь для камеры и системного сканера.
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
        setResult({ success: false, message: 'Это не QR-код subday' });
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
          qrNonce: data.n || undefined,       // одноразовый код — сервер погасит его при списании
        },
      });
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('scan-timeout')), 15000),
      );
      const { data: response, error } = await Promise.race([invokePromise, timeoutPromise]) as Awaited<typeof invokePromise>;

      if (error) {
        console.error('Edge function error:', error);
        // supabase-js прячет тело ответа за общим сообщением — достаём реальную
        // причину с сервера (напр. «QR уже использован»), иначе бариста видит
        // бесполезное «Ошибка при обработке».
        let msg = 'Ошибка при обработке. Попробуйте ещё раз.';
        try {
          const b = await (error as { context?: { json?: () => Promise<{ error?: string }> } }).context?.json?.();
          if (b?.error) msg = b.error;
        } catch { /* тело недоступно — оставим общий текст */ }
        setResult({ success: false, message: msg });
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

  // Системный сканер работает циклом: открыли → прочитали → списали → показали
  // результат → открыли снова. Бариста сканирует подряд, ничего не нажимая, — так
  // же, как с постоянной камерой. Любой отказ (нет модуля, закрыли окно) молча
  // переводит на встроенную камеру, поэтому тупика на этом экране быть не может.
  const handleScanRef = useRef(handleScan);
  useEffect(() => { handleScanRef.current = handleScan; });
  useEffect(() => () => { nativeStopRef.current = true; }, []);

  useEffect(() => {
    if (webFallback || nativeLoopRef.current) return;
    // Пока адрес смены не выбран, системное окно перекрыло бы диалог выбора.
    if (shopAddresses.length > 1 && !shiftAddress) return;
    nativeLoopRef.current = true;
    (async () => {
      while (!nativeStopRef.current) {
        const res = await nativeScanQR();
        if (res.status !== 'scanned') { setWebFallback(true); break; }
        await handleScanRef.current(res.value);
        await new Promise(r => setTimeout(r, 2600)); // дать разглядеть результат
      }
      nativeLoopRef.current = false;
    })();
  }, [webFallback, shopAddresses.length, shiftAddress]);

  // Страховка от «вечного лоадера»: если через 6 секунд системное окно так и не
  // открылось (страница всё ещё на переднем плане), включаем встроенную камеру.
  useEffect(() => {
    if (webFallback) return;
    const t = setTimeout(() => {
      // Сканер уже открыт (на iOS он лежит слоем поверх страницы, и та остаётся
      // «видимой») — вторую камеру поднимать нельзя.
      if (isNativeScanOpen()) return;
      if (document.visibilityState === 'visible') setWebFallback(true);
    }, 6000);
    return () => clearTimeout(t);
  }, [webFallback]);

  return (
    <PartnerLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-center gap-3 px-4 pt-4">
          <h2 className="text-xl font-bold text-foreground text-center">
            Сканер QR-кодов
          </h2>
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
        {/* Второй способ забора: показать QR кофейни — его сканирует сам гость */}
        <div className="px-4 pb-2">
          <button
            onClick={() => {
              // У кофейни несколько адресов и точка ещё не выбрана — сначала спросим
              // адрес (как при скане). Общий QR на всю кофейню не выпускаем: он принял
              // бы любую кассу кофейни, и списание могло уйти не на тот аккаунт.
              // Точек с одним адресом это не касается — там адрес подставлен сам.
              if (!showShopQR && shopAddresses.length > 1 && !shiftAddress) {
                setShowAddrDialog(true);
                return;
              }
              setShowShopQR(v => !v);
            }}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-secondary text-foreground text-sm font-medium active:scale-95 transition-transform"
          >
            <QrCode size={16} className="text-primary" />
            {showShopQR ? 'Скрыть QR кофейни' : 'Показать QR кофейни'}
          </button>
        </div>
        {showShopQR && shopId && (shopAddresses.length <= 1 || !!shiftAddress) && (
          <div className="px-4 pb-2">
            <ShopQRCode shopId={shopId} address={shiftAddress || ''} canRotate={isPartner} onClose={() => setShowShopQR(false)} />
          </div>
        )}

        <div className="px-4 relative">
          {/* Встроенную камеру монтируем ТОЛЬКО когда системный сканер не у дел:
              иначе рядом с ним поднялась бы вторая камера и они подрались бы за
              устройство. */}
          {webFallback ? (
            <QRScanner onScan={handleScan} isProcessing={isProcessing || result !== null} />
          ) : (
            <div className="aspect-square w-full rounded-xl bg-secondary flex flex-col items-center justify-center gap-3">
              <Loader2 size={32} className="animate-spin text-primary" />
              <p className="text-muted-foreground text-sm">Открываем сканер…</p>
            </div>
          )}
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
        {/* Подсказка живёт здесь, а не в QRScanner: компонент общий с гостевым
            сканером, и партнёрский текст протекал на сторону пользователя. */}
        <p className="px-4 text-center text-sm text-muted-foreground">
          Наведите камеру на QR-код клиента — код считается автоматически
        </p>
        {/* Блок «QR действителен 1 минуту» убран: срока у кода нет — timestamp
            не входит в payload и сервером не проверяется, так что предупреждение
            вводило бариста в заблуждение. */}
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