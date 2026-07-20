import { useState, useRef, useCallback, useEffect } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { Camera, Loader2, Usb, Wifi, WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Capacitor } from '@capacitor/core';
import { useSerialScanner } from '@/hooks/useSerialScanner';

const CAMERA_GRANTED_KEY = 'qr_camera_granted';
const SCANNER_MODE_KEY = 'qr_scanner_mode'; // 'camera' | 'usb'

function waitForElementReady(id: string, timeout = 3000): Promise<boolean> {
  return new Promise(resolve => {
    const start = Date.now();
    const check = () => {
      const el = document.getElementById(id);
      if (el && el.offsetWidth > 0 && el.offsetHeight > 0) { resolve(true); return; }
      if (Date.now() - start > timeout) { resolve(false); return; }
      requestAnimationFrame(check);
    };
    requestAnimationFrame(check);
  });
}

// Ждём, пока видеопоток реально начнёт отдавать кадры (readyState >= 2 —
// HAVE_CURRENT_DATA), а не просто фиксированную паузу вслепую. На быстрых
// устройствах кадры идут почти сразу — рестарт случится раньше maxWaitMs,
// на медленных — не позже потолка. Не гарантия того, что внутренний цикл
// декодера html5-qrcode "прогрелся" (это состояние снаружи не видно), но
// честный нижний порог вместо случайного числа.
function waitForVideoFrame(containerId: string, maxWaitMs: number): Promise<void> {
  return new Promise(resolve => {
    const start = Date.now();
    const check = () => {
      const video = document.querySelector<HTMLVideoElement>(`#${containerId} video`);
      if (video && video.readyState >= 2 && video.videoWidth > 0) { resolve(); return; }
      if (Date.now() - start > maxWaitMs) { resolve(); return; }
      requestAnimationFrame(check);
    };
    requestAnimationFrame(check);
  });
}

async function ensureNativeCameraPermission(): Promise<'granted' | 'denied' | 'unavailable'> {
  if (!Capacitor.isNativePlatform()) return 'unavailable';
  try {
    const { Camera: NativeCamera } = await import('@capacitor/camera');
    let status = await NativeCamera.checkPermissions();
    if (status.camera !== 'granted') {
      status = await NativeCamera.requestPermissions({ permissions: ['camera'] });
    }
    return status.camera === 'granted' ? 'granted' : 'denied';
  } catch (err) {
    console.error('[QRScanner] Native camera permission error:', err);
    return 'denied';
  }
}

interface QRScannerProps {
  onScan: (data: string) => void;
  isProcessing: boolean;
}

export function QRScanner({ onScan, isProcessing }: QRScannerProps) {
  const savedMode = (localStorage.getItem(SCANNER_MODE_KEY) as 'camera' | 'usb') || 'camera';
  const [mode, setMode] = useState<'camera' | 'usb'>(savedMode);

  // ─── Камера ───────────────────────────────────────────────────────────────
  const [isScanning, setIsScanning] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scannerRef = useRef<Html5Qrcode | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const lastScannedRef = useRef<string | null>(null);
  const scanTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isProcessingRef = useRef(isProcessing);
  const lastSerialScannedRef = useRef<string | null>(null);
  const serialScanTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const mountedRef = useRef(true);
  const didAutoRestartRef = useRef(false);

  useEffect(() => { isProcessingRef.current = isProcessing; }, [isProcessing]);

  // ─── USB-сканер ───────────────────────────────────────────────────────────
  const handleSerialScan = useCallback((raw: string) => {
  if (isProcessingRef.current) return;
  // Защита от двойного срабатывания на один QR
  if (lastSerialScannedRef.current === raw) return;
  try {
    const data = JSON.parse(raw);
    // USB-сканер принимает и обычные списания, и предзаказы (оба идут в один onScan).
    if (data.type === 'subday_redeem' || data.type === 'subday_preorder') {
      lastSerialScannedRef.current = raw;
      // Сбрасываем через 3 секунды чтобы тот же QR можно было снова использовать
      if (serialScanTimeoutRef.current) clearTimeout(serialScanTimeoutRef.current);
      serialScanTimeoutRef.current = setTimeout(() => {
        lastSerialScannedRef.current = null;
      }, 3000);
      onScan(raw);
    }
  } catch {
    console.warn('[SerialScanner] Невалидный QR:', raw);
  }
}, [onScan]);

  const { status: serialStatus, errorMsg: serialError, connect, disconnect, isSupported } =
    useSerialScanner({ onScan: handleSerialScan });

  // ─── Переключение режима ──────────────────────────────────────────────────
  const switchMode = useCallback((newMode: 'camera' | 'usb') => {
    // Останавливаем камеру если переключаемся
    if (newMode === 'usb') {
      stopScannerCleanup();
      setIsScanning(false);
    }
    // Отключаем USB если переключаемся
    if (newMode === 'camera') {
      disconnect();
    }
    setMode(newMode);
    localStorage.setItem(SCANNER_MODE_KEY, newMode);
  }, [disconnect]);

  // ─── Жизненный цикл ──────────────────────────────────────────────────────
  useEffect(() => {
    mountedRef.current = true;
    if (mode === 'camera' && localStorage.getItem(CAMERA_GRANTED_KEY)) {
      startScanner();
    }
    return () => {
      mountedRef.current = false;
      stopScannerCleanup();
    };
  }, []);

  const stopScannerCleanup = () => {
    if (scanTimeoutRef.current) { clearTimeout(scanTimeoutRef.current); scanTimeoutRef.current = null; }
    if (scannerRef.current) {
      try { scannerRef.current.stop().catch(() => {}); } catch {}
      try { scannerRef.current.clear(); } catch {}
      scannerRef.current = null;
    }
  };

  const handleScan = useCallback((decodedText: string) => {
    if (isProcessingRef.current) return;
    if (lastScannedRef.current === decodedText) return;
    lastScannedRef.current = decodedText;
    onScan(decodedText);
    if (scanTimeoutRef.current) clearTimeout(scanTimeoutRef.current);
    scanTimeoutRef.current = setTimeout(() => { lastScannedRef.current = null; }, 1500);
  }, [onScan]);

  const startScanner = useCallback(async () => {
    stopScannerCleanup();
    if (!mountedRef.current) return;
    setIsStarting(true);
    setIsScanning(false);
    setError(null);
    lastScannedRef.current = null;

    const nativePerm = await ensureNativeCameraPermission();
    if (nativePerm === 'denied') {
      if (!mountedRef.current) return;
      localStorage.removeItem(CAMERA_GRANTED_KEY);
      setError('Доступ к камере запрещён. Откройте настройки и включите камеру.');
      setIsStarting(false);
      return;
    }

    const [ready] = await Promise.all([
      waitForElementReady('qr-reader'),
      new Promise<boolean>(r => setTimeout(() => r(true), 500)),
    ]);
    if (!mountedRef.current) return;

    const el = document.getElementById('qr-reader');
    if (!el || !ready) {
      setError('Ошибка инициализации сканера');
      setIsStarting(false);
      return;
    }
    el.innerHTML = '';

    try {
      // useBarCodeDetectorIfSupported → нативный движок BarcodeDetector (Google ML):
      // читает QR с крутых углов, частично видимый код, и заметно быстрее.
      // Если платформа не поддерживает — html5-qrcode сам откатывается на JS-декодер.
      const scanner = new Html5Qrcode('qr-reader', {
        formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
        experimentalFeatures: { useBarCodeDetectorIfSupported: true },
        verbose: false,
      });
      scannerRef.current = scanner;
      // disableFlip: false → читаем и зеркально отражённые коды.
      await scanner.start({ facingMode: 'environment' }, { fps: 25, aspectRatio: 1, disableFlip: false }, handleScan, () => {});
      if (!mountedRef.current) { scanner.stop().catch(() => {}); return; }

      // html5-qrcode часто не начинает распознавание с первого старта —
      // видео идёт, а декодер молчит. Чинит только полный перезапуск.
      // Делаем его СРАЗУ, ещё под спиннером "Запускаем камеру..." (isScanning
      // ещё не выставлен), и только потом показываем сканер пользователю —
      // так он не видит, что камера открылась и тут же перезапустилась:
      // видит один непрерывный лоадер, а затем сразу рабочий сканер.
      if (!didAutoRestartRef.current) {
        didAutoRestartRef.current = true;
        await waitForVideoFrame('qr-reader', 150);
        // Пользователь мог за это время уйти со страницы или переключиться
        // на USB-сканер — тогда камеру поднимать заново не нужно.
        if (!mountedRef.current || mode !== 'camera') return;
        try { await scanner.stop(); scanner.clear(); } catch { /* игнор — всё равно пересоздаём */ }
        scannerRef.current = null;
        if (!mountedRef.current || mode !== 'camera') return;
        await startScanner(); // тот же полный путь запуска, что и раньше
        return;
      }

      setIsScanning(true);
      setError(null);
      localStorage.setItem(CAMERA_GRANTED_KEY, 'true');
    } catch (err: any) {
      scannerRef.current = null;
      if (!mountedRef.current) return;
      const errMsg = String(err?.message || err || '');
      if (errMsg.includes('NotAllowedError') || errMsg.includes('Permission') || errMsg.includes('denied')) {
        localStorage.removeItem(CAMERA_GRANTED_KEY);
        setError('Доступ к камере запрещён.');
      } else if (errMsg.includes('NotFoundError')) {
        setError('Камера не найдена на устройстве.');
      } else if (errMsg.includes('NotReadableError')) {
        setError('Камера занята другим приложением.');
      } else {
        setError('Не удалось запустить камеру. Нажмите «Перезапустить».');
      }
    } finally {
      if (mountedRef.current) setIsStarting(false);
    }
  }, [handleScan]);
  // ─── Рендер ──────────────────────────────────────────────────────────────

  const serialConnected = serialStatus === 'connected';
  const serialConnecting = serialStatus === 'connecting';

  return (
    <div className="flex flex-col items-center gap-3 w-full">

      {/* Переключатель режимов — показываем только если Web Serial поддерживается */}
      {isSupported && (
        <div className="flex w-full rounded-lg border border-border overflow-hidden">
          <button
            onClick={() => switchMode('camera')}
            className={`flex-1 flex items-center justify-center gap-2 py-2 text-sm font-medium transition-colors
              ${mode === 'camera'
                ? 'bg-accent text-accent-foreground'
                : 'bg-secondary text-muted-foreground hover:bg-muted'}`}
          >
            <Camera size={16} />
            Камера
          </button>
          <button
            onClick={() => switchMode('usb')}
            className={`flex-1 flex items-center justify-center gap-2 py-2 text-sm font-medium transition-colors
              ${mode === 'usb'
                ? 'bg-accent text-accent-foreground'
                : 'bg-secondary text-muted-foreground hover:bg-muted'}`}
          >
            <Usb size={16} />
            USB-сканер
          </button>
        </div>
      )}

      {/* ── Режим USB-сканера ─────────────────────────────────────────────── */}
      {mode === 'usb' && (
        <div className="w-full flex flex-col items-center gap-4">
          <div className="w-full aspect-square bg-secondary rounded-xl flex flex-col items-center justify-center gap-5 px-6">

            {/* Статус подключения */}
            <div className={`w-20 h-20 rounded-full flex items-center justify-center
              ${serialConnected ? 'bg-green-500/20' : 'bg-muted'}`}>
              {serialConnected
                ? <Wifi size={40} className="text-green-500" />
                : <WifiOff size={40} className="text-muted-foreground" />}
            </div>

            <div className="text-center">
              {serialStatus === 'disconnected' && (
                <p className="text-muted-foreground text-sm">Сканер не подключён</p>
              )}
              {serialConnecting && (
                <p className="text-muted-foreground text-sm">Подключение...</p>
              )}
              {serialConnected && (
                <>
                  <p className="text-green-500 font-semibold">Сканер подключён ✓</p>
                  <p className="text-muted-foreground text-sm mt-1">
                    Поднесите QR-код клиента к сканеру
                  </p>
                </>
              )}
              {serialStatus === 'error' && (
                <p className="text-destructive text-sm">{serialError}</p>
              )}
            </div>

            {/* Processing overlay */}
            {isProcessing && serialConnected && (
              <div className="flex flex-col items-center gap-2">
                <Loader2 size={32} className="text-accent animate-spin" />
                <p className="text-sm font-medium">Обрабатываем...</p>
              </div>
            )}
          </div>

          {/* Кнопки управления USB */}
          {!serialConnected ? (
            <Button
              size="lg"
              onClick={connect}
              disabled={serialConnecting}
              className="w-full"
            >
              {serialConnecting
                ? <><Loader2 size={18} className="mr-2 animate-spin" />Подключение...</>
                : <><Usb size={18} className="mr-2" />Подключить сканер</>}
            </Button>
          ) : (
            <Button
              size="lg"
              variant="outline"
              onClick={disconnect}
              className="w-full"
            >
              Отключить сканер
            </Button>
          )}

          {!isSupported && (
            <p className="text-xs text-muted-foreground text-center">
              Web Serial API не поддерживается. Используйте Chrome или Edge.
            </p>
          )}
        </div>
      )}

      {/* ── Режим камеры (оригинальный код) ──────────────────────────────── */}
      {mode === 'camera' && (
        <>
          <div
            ref={containerRef}
            className="relative w-full aspect-square bg-secondary overflow-hidden qr-scanner-container rounded-xl"
          >
            <div id="qr-reader" className="w-full h-full [&_video]:object-cover [&_video]:w-full [&_video]:h-full [&>img]:hidden" />

            {isScanning && (
              <div className="absolute inset-0 pointer-events-none">
                <div className="absolute inset-[8%] border-2 border-white/80 rounded-lg">
                  <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-accent rounded-tl-lg" />
                  <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-accent rounded-tr-lg" />
                  <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-accent rounded-bl-lg" />
                  <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-accent rounded-br-lg" />
                  {!isProcessing && (
                    <div className="absolute inset-x-0 h-0.5 bg-gradient-to-r from-transparent via-accent to-transparent animate-scan-line shadow-[0_0_8px_hsl(var(--accent))]" />
                  )}
                </div>
              </div>
            )}

            {isProcessing && isScanning && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/50 pointer-events-none">
                <Loader2 size={40} className="text-white animate-spin" />
                <p className="text-white font-medium">Обрабатываем...</p>
              </div>
            )}

            {!isScanning && !isStarting && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 bg-secondary px-6">
                <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center">
                  <Camera size={40} className="text-muted-foreground" />
                </div>
                <p className="text-muted-foreground text-center text-sm">
                  {error || 'Нажмите кнопку для запуска камеры'}
                </p>
                <Button size="lg" onClick={startScanner} className="w-full max-w-[220px]">
                  <Camera size={20} className="mr-2" />
                  {error ? 'Попробовать снова' : 'Открыть камеру'}
                </Button>
              </div>
            )}

            {isStarting && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-secondary">
                <Loader2 size={40} className="text-muted-foreground animate-spin" />
                <p className="text-muted-foreground text-center px-4">Запускаем камеру...</p>
              </div>
            )}
          </div>

          {isScanning && !isProcessing && (
            <div className="flex items-center gap-3 w-full">
              <Button size="lg" onClick={startScanner} className="w-full">
                ✅ Сканировать QR
              </Button>
            </div>
          )}

          {isScanning && !isProcessing && (
            <div className="flex flex-col items-center gap-1">
              <p className="text-sm text-muted-foreground text-center">
                Наведите камеру на QR-код клиента
              </p>
              <p className="text-xs text-red-500 text-center font-medium">
                Нажмите ✅ Сканировать QR если код не сканируется!
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}