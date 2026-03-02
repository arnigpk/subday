import { useState, useEffect, useRef, useCallback } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { Camera, Loader2 } from 'lucide-react';

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

  // Keep ref in sync so callback doesn't need dep
  useEffect(() => {
    isProcessingRef.current = isProcessing;
  }, [isProcessing]);

  const handleScan = useCallback((decodedText: string) => {
    // Block scans while processing
    if (isProcessingRef.current) return;
    
    // Prevent duplicate scans within 1.5 seconds
    if (lastScannedRef.current === decodedText) return;
    
    lastScannedRef.current = decodedText;
    console.log('QR Code scanned:', decodedText);
    onScan(decodedText);
    
    // Reset after 1.5 seconds to allow re-scanning same code
    if (scanTimeoutRef.current) {
      clearTimeout(scanTimeoutRef.current);
    }
    scanTimeoutRef.current = setTimeout(() => {
      lastScannedRef.current = null;
    }, 1500);
  }, [onScan]);

  const startScanner = useCallback(async () => {
    if (!containerRef.current || scannerRef.current) return;

    try {
      setError(null);
      lastScannedRef.current = null;
      
      const scanner = new Html5Qrcode('qr-reader');
      scannerRef.current = scanner;

      // 85% of container for larger scan area
      const containerWidth = containerRef.current?.offsetWidth || 300;
      const qrboxSize = Math.floor(containerWidth * 0.85);
      
      await scanner.start(
        { 
          facingMode: 'environment',
        },
        {
          fps: 30,
          qrbox: { width: qrboxSize, height: qrboxSize },
          videoConstraints: {
            facingMode: 'environment',
            advanced: [{ width: 1280, height: 720 } as any],
          },
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
    }
  }, [handleScan]);

  // Auto-start camera on mount
  useEffect(() => {
    mountedRef.current = true;
    // Small delay to ensure DOM element is rendered
    const timer = setTimeout(() => {
      if (mountedRef.current) {
        startScanner();
      }
    }, 100);

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
        className="relative w-full aspect-square bg-secondary overflow-hidden qr-scanner-container"
      >
        <div id="qr-reader" className="w-full h-full" />
        
        {/* Custom square frame overlay with scanning line */}
        {isScanning && (
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute inset-[5%] border-2 border-white/80">
              {/* Corner accents */}
              <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-accent" />
              <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-accent" />
              <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-accent" />
              <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-accent" />
              
              {/* Animated scanning line */}
              {!isProcessing && (
                <div className="absolute inset-x-0 h-0.5 bg-gradient-to-r from-transparent via-accent to-transparent animate-scan-line shadow-[0_0_8px_hsl(var(--accent))]" />
              )}
            </div>
          </div>
        )}

        {/* Processing overlay on top of live camera */}
        {isProcessing && isScanning && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/50 pointer-events-none">
            <Loader2 size={40} className="text-white animate-spin" />
            <p className="text-white font-medium">Обрабатываем...</p>
          </div>
        )}
        
        {!isScanning && !error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-secondary">
            <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center">
              <Loader2 size={40} className="text-muted-foreground animate-spin" />
            </div>
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
            onClick={startScanner}
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
