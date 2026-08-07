import { useState, useRef, useCallback, useEffect } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { Camera, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Capacitor } from '@capacitor/core';

const CAMERA_GRANTED_KEY = 'qr_camera_granted';

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
  /**
   * Запускать камеру сразу при открытии, не дожидаясь ранее выданного
   * разрешения. Для гостя экран открывается по явному нажатию «Сканировать»,
   * поэтому системный запрос должен выйти прямо там, а не после ещё одной
   * кнопки. У бариста сканер живёт постоянно на странице — там прежнее
   * поведение (стартуем только если разрешение уже давали).
   */
  autoStart?: boolean;
}

export function QRScanner({ onScan, isProcessing, autoStart = false }: QRScannerProps) {
  // ─── Камера ───────────────────────────────────────────────────────────────
  const [isScanning, setIsScanning] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scannerRef = useRef<Html5Qrcode | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const lastScannedRef = useRef<string | null>(null);
  const scanTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isProcessingRef = useRef(isProcessing);
  const mountedRef = useRef(true);
  const didAutoRestartRef = useRef(false);

  useEffect(() => { isProcessingRef.current = isProcessing; }, [isProcessing]);

  // ─── Жизненный цикл ──────────────────────────────────────────────────────
  useEffect(() => {
    mountedRef.current = true;
    if (autoStart || localStorage.getItem(CAMERA_GRANTED_KEY)) {
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
        // Пользователь мог за это время уйти со страницы — тогда камеру
        // поднимать заново не нужно.
        if (!mountedRef.current) return;
        try { await scanner.stop(); scanner.clear(); } catch { /* игнор — всё равно пересоздаём */ }
        scannerRef.current = null;
        if (!mountedRef.current) return;
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

  return (
    <div className="flex flex-col items-center gap-3 w-full">

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

          {/* Кнопка «Сканировать QR» и подсказки убраны: камера ловит код сама,
              а текст под сканером задаёт экран-владелец (у партнёра свой,
              у гостя свой) — иначе партнёрские надписи протекали к гостю. */}
    </div>
  );
}