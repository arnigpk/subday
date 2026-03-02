import { useState, useRef, useCallback, useEffect } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { Camera, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

const CAMERA_GRANTED_KEY = 'qr_camera_granted';

interface QRScannerProps {
  onScan: (data: string) => void;
  isProcessing: boolean;
}

export function QRScanner({ onScan, isProcessing }: QRScannerProps) {
  const [isScanning, setIsScanning] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const lastScannedRef = useRef<string | null>(null);
  const scanTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isProcessingRef = useRef(isProcessing);
  const mountedRef = useRef(true);

  useEffect(() => {
    isProcessingRef.current = isProcessing;
  }, [isProcessing]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (scannerRef.current) {
        scannerRef.current.stop().catch(() => {});
        scannerRef.current = null;
      }
      if (scanTimeoutRef.current) {
        clearTimeout(scanTimeoutRef.current);
      }
    };
  }, []);

  // Auto-start if permission was previously granted
  useEffect(() => {
    const wasGranted = localStorage.getItem(CAMERA_GRANTED_KEY) === 'true';
    if (!wasGranted) return;

    // Check actual browser permission before auto-starting
    navigator.permissions?.query({ name: 'camera' as PermissionName })
      .then(result => {
        if (result.state === 'granted' && mountedRef.current && !scannerRef.current) {
          startScanner();
        }
      })
      .catch(() => {
        // permissions API not supported — still try auto-start
        if (mountedRef.current && !scannerRef.current) {
          startScanner();
        }
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleScan = useCallback((decodedText: string) => {
    if (isProcessingRef.current) return;
    if (lastScannedRef.current === decodedText) return;
    
    lastScannedRef.current = decodedText;
    console.log('QR Code scanned:', decodedText);
    onScan(decodedText);
    
    if (scanTimeoutRef.current) clearTimeout(scanTimeoutRef.current);
    scanTimeoutRef.current = setTimeout(() => {
      lastScannedRef.current = null;
    }, 1500);
  }, [onScan]);

  const startScanner = async () => {
    if (scannerRef.current || !mountedRef.current) return;

    setIsStarting(true);
    setError(null);
    lastScannedRef.current = null;

    // Wait for DOM to be ready
    await new Promise(r => setTimeout(r, 100));
    if (!mountedRef.current) return;

    const el = document.getElementById('qr-reader');
    if (!el) {
      setIsStarting(false);
      return;
    }

    try {
      const scanner = new Html5Qrcode('qr-reader');
      scannerRef.current = scanner;

      const containerWidth = containerRef.current?.offsetWidth || 300;
      const qrboxSize = Math.floor(containerWidth * 0.8);

      await scanner.start(
        { facingMode: 'environment' },
        { fps: 30, qrbox: { width: qrboxSize, height: qrboxSize } },
        handleScan,
        () => {}
      );

      if (!mountedRef.current) {
        scanner.stop().catch(() => {});
        return;
      }

      setIsScanning(true);
      localStorage.setItem(CAMERA_GRANTED_KEY, 'true');
      console.log('Scanner started successfully');
    } catch (err: any) {
      console.error('Failed to start scanner:', err);
      scannerRef.current = null;
      if (!mountedRef.current) return;
      const errMsg = String(err?.message || err || '');
      if (errMsg.includes('NotAllowedError') || errMsg.includes('Permission')) {
        localStorage.removeItem(CAMERA_GRANTED_KEY);
        setError('Доступ к камере запрещён. Разрешите в настройках браузера.');
      } else {
        setError('Не удалось запустить камеру. Проверьте разрешения.');
      }
    } finally {
      if (mountedRef.current) setIsStarting(false);
    }
  };

  const handleStartClick = () => {
    startScanner();
  };

  return (
    <div className="flex flex-col items-center gap-4 w-full">
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
            <Button size="lg" onClick={handleStartClick} className="w-full max-w-[200px]">
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
        <p className="text-sm text-muted-foreground text-center">
          Наведите камеру на QR-код клиента
        </p>
      )}
    </div>
  );
}
