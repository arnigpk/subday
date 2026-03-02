import { useState, useRef, useCallback, useEffect } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { Camera, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface QRScannerProps {
  onScan: (data: string) => void;
  isProcessing: boolean;
}

export function QRScanner({ onScan, isProcessing }: QRScannerProps) {
  const [isScanning, setIsScanning] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasEverStarted, setHasEverStarted] = useState(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const lastScannedRef = useRef<string | null>(null);
  const scanTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isProcessingRef = useRef(isProcessing);

  useEffect(() => {
    isProcessingRef.current = isProcessing;
  }, [isProcessing]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (scannerRef.current) {
        scannerRef.current.stop().catch(() => {});
        scannerRef.current = null;
      }
      if (scanTimeoutRef.current) {
        clearTimeout(scanTimeoutRef.current);
      }
    };
  }, []);

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

  // CRITICAL: Must be called directly from a click handler for Telegram Mini App
  const handleStartClick = async () => {
    if (scannerRef.current || isStarting) return;
    if (!containerRef.current) return;

    setIsStarting(true);
    setError(null);
    lastScannedRef.current = null;

    try {
      const scanner = new Html5Qrcode('qr-reader');
      scannerRef.current = scanner;

      const containerWidth = containerRef.current.offsetWidth || 300;
      const qrboxSize = Math.floor(containerWidth * 0.8);

      // getUserMedia is called inside scanner.start — must be in click handler
      await scanner.start(
        { facingMode: 'environment' },
        {
          fps: 30,
          qrbox: { width: qrboxSize, height: qrboxSize },
        },
        handleScan,
        () => {}
      );

      setIsScanning(true);
      setHasEverStarted(true);
      console.log('Scanner started successfully');
    } catch (err: any) {
      console.error('Failed to start scanner:', err);
      scannerRef.current = null;
      const errMsg = String(err?.message || err || '');
      if (errMsg.includes('NotAllowedError') || errMsg.includes('Permission')) {
        setError('Доступ к камере запрещён. Разрешите в настройках браузера.');
      } else {
        setError('Не удалось запустить камеру. Проверьте разрешения.');
      }
    } finally {
      setIsStarting(false);
    }
  };

  return (
    <div className="flex flex-col items-center gap-4 w-full">
      <div 
        ref={containerRef}
        className="relative w-full aspect-square bg-secondary overflow-hidden qr-scanner-container rounded-xl"
      >
        <div id="qr-reader" className="w-full h-full [&_video]:object-cover [&_video]:w-full [&_video]:h-full [&>img]:hidden" />
        
        {/* Scan frame overlay */}
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

        {/* Processing overlay */}
        {isProcessing && isScanning && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/50 pointer-events-none">
            <Loader2 size={40} className="text-white animate-spin" />
            <p className="text-white font-medium">Обрабатываем...</p>
          </div>
        )}
        
        {/* Initial state — button to start camera (user gesture required) */}
        {!isScanning && !isStarting && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 bg-secondary px-6">
            <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center">
              <Camera size={40} className="text-muted-foreground" />
            </div>
            <p className="text-muted-foreground text-center text-sm">
              {error 
                ? error 
                : 'Нажмите кнопку для запуска камеры'
              }
            </p>
            <Button 
              size="lg" 
              onClick={handleStartClick}
              className="w-full max-w-[200px]"
            >
              <Camera size={20} className="mr-2" />
              {error ? 'Попробовать снова' : 'Открыть камеру'}
            </Button>
          </div>
        )}

        {/* Starting state */}
        {isStarting && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-secondary">
            <Loader2 size={40} className="text-muted-foreground animate-spin" />
            <p className="text-muted-foreground text-center px-4">
              Запускаем камеру...
            </p>
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
