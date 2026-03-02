import { useState, useEffect, useRef, useCallback } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { Loader2 } from 'lucide-react';

interface QRScannerProps {
  onScan: (data: string) => void;
  isProcessing: boolean;
}

export function QRScanner({ onScan, isProcessing }: QRScannerProps) {
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const lastScannedRef = useRef<string | null>(null);
  const scanTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isProcessingRef = useRef(isProcessing);
  const mountedRef = useRef(true);
  const startingRef = useRef(false);

  useEffect(() => {
    isProcessingRef.current = isProcessing;
  }, [isProcessing]);

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

  const startScanner = useCallback(async () => {
    if (!containerRef.current || scannerRef.current || startingRef.current) return;
    startingRef.current = true;

    try {
      setError(null);
      lastScannedRef.current = null;
      
      const scanner = new Html5Qrcode('qr-reader');
      scannerRef.current = scanner;

      const containerWidth = containerRef.current?.offsetWidth || 300;
      const qrboxSize = Math.floor(containerWidth * 0.8);
      
      await scanner.start(
        { facingMode: 'environment' },
        {
          fps: 30,
          qrbox: { width: qrboxSize, height: qrboxSize },
        },
        handleScan,
        () => {}
      );

      if (mountedRef.current) {
        setIsScanning(true);
        console.log('Scanner started successfully');
      }
    } catch (err) {
      console.error('Failed to start scanner:', err);
      if (mountedRef.current) {
        setError('Не удалось запустить камеру. Проверьте разрешения.');
      }
    } finally {
      startingRef.current = false;
    }
  }, [handleScan]);

  // Auto-start camera on mount
  useEffect(() => {
    mountedRef.current = true;
    const timer = setTimeout(() => {
      if (mountedRef.current) {
        startScanner();
      }
    }, 300);

    return () => {
      mountedRef.current = false;
      clearTimeout(timer);
      if (scannerRef.current) {
        scannerRef.current.stop().catch(() => {});
        scannerRef.current = null;
      }
      if (scanTimeoutRef.current) {
        clearTimeout(scanTimeoutRef.current);
      }
    };
  }, [startScanner]);

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
        
        {!isScanning && !error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-secondary">
            <Loader2 size={40} className="text-muted-foreground animate-spin" />
            <p className="text-muted-foreground text-center px-4">
              Запускаем камеру...
            </p>
          </div>
        )}
      </div>

      {error && (
        <div className="text-center space-y-3">
          <p className="text-destructive text-sm">{error}</p>
          <button
            onClick={() => {
              scannerRef.current = null;
              startScanner();
            }}
            className="text-primary underline text-sm"
          >
            Попробовать снова
          </button>
        </div>
      )}

      {isScanning && !isProcessing && (
        <p className="text-sm text-muted-foreground text-center">
          Наведите камеру на QR-код клиента
        </p>
      )}
    </div>
  );
}
