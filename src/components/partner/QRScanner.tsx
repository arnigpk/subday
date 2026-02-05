import { useState, useEffect, useRef, useCallback } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { Camera, CameraOff, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

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

  const handleScan = useCallback((decodedText: string) => {
    // Prevent duplicate scans within 3 seconds
    if (lastScannedRef.current === decodedText) return;
    
    lastScannedRef.current = decodedText;
    console.log('QR Code scanned:', decodedText);
    onScan(decodedText);
    
    // Reset after 3 seconds to allow re-scanning same code
    if (scanTimeoutRef.current) {
      clearTimeout(scanTimeoutRef.current);
    }
    scanTimeoutRef.current = setTimeout(() => {
      lastScannedRef.current = null;
    }, 3000);
  }, [onScan]);

  const startScanner = async () => {
    if (!containerRef.current) return;

    try {
      setError(null);
      lastScannedRef.current = null;
      
      const scanner = new Html5Qrcode('qr-reader');
      scannerRef.current = scanner;

      // Calculate qrbox size based on container width (70% of container)
      const containerWidth = containerRef.current?.offsetWidth || 300;
      const qrboxSize = Math.floor(containerWidth * 0.7);
      
      await scanner.start(
        { facingMode: 'environment' },
        {
          fps: 30,
          qrbox: { width: qrboxSize, height: qrboxSize },
        },
        handleScan,
        () => {
          // Ignore errors during scanning (no QR found)
        }
      );

      setIsScanning(true);
      console.log('Scanner started successfully');
    } catch (err) {
      console.error('Failed to start scanner:', err);
      setError('Не удалось запустить камеру. Проверьте разрешения.');
    }
  };

  const stopScanner = async () => {
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop();
        scannerRef.current = null;
      } catch (err) {
        console.error('Failed to stop scanner:', err);
      }
    }
    setIsScanning(false);
  };

  useEffect(() => {
    return () => {
      stopScanner();
      if (scanTimeoutRef.current) {
        clearTimeout(scanTimeoutRef.current);
      }
    };
  }, []);

  // Stop scanner when processing
  useEffect(() => {
    if (isProcessing && isScanning) {
      stopScanner();
    }
  }, [isProcessing, isScanning]);

  return (
    <div className="flex flex-col items-center gap-4 w-full">
      <div 
        ref={containerRef}
        className="relative w-full aspect-square bg-secondary overflow-hidden qr-scanner-container"
      >
        <div id="qr-reader" className="w-full h-full" />
        
        {/* Custom square frame overlay with scanning line */}
        {isScanning && !isProcessing && (
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute inset-[10%] border-2 border-white/80">
              {/* Corner accents */}
              <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-accent" />
              <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-accent" />
              <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-accent" />
              <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-accent" />
              
              {/* Animated scanning line */}
              <div className="absolute inset-x-0 h-0.5 bg-gradient-to-r from-transparent via-accent to-transparent animate-scan-line shadow-[0_0_8px_hsl(var(--accent))]" />
            </div>
          </div>
        )}
        
        {!isScanning && !isProcessing && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-secondary">
            <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center">
              <Camera size={40} className="text-muted-foreground" />
            </div>
            <p className="text-muted-foreground text-center px-4">
              Нажмите кнопку ниже, чтобы начать сканирование
            </p>
          </div>
        )}

        {isProcessing && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-secondary/80">
            <Loader2 size={40} className="text-primary animate-spin" />
            <p className="text-foreground font-medium">Обрабатываем...</p>
          </div>
        )}
      </div>

      {error && (
        <p className="text-destructive text-sm text-center">{error}</p>
      )}

      <Button
        size="lg"
        onClick={isScanning ? stopScanner : startScanner}
        disabled={isProcessing}
        className="w-full"
      >
        {isScanning ? (
          <>
            <CameraOff size={20} className="mr-2" />
            Остановить сканер
          </>
        ) : (
          <>
            <Camera size={20} className="mr-2" />
            Начать сканирование
          </>
        )}
      </Button>

      {isScanning && (
        <p className="text-sm text-muted-foreground text-center">
          Наведите камеру на QR-код клиента
        </p>
      )}
    </div>
  );
}
