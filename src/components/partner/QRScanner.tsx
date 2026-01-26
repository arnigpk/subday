import { useState, useEffect, useRef } from 'react';
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

  const startScanner = async () => {
    if (!containerRef.current) return;

    try {
      setError(null);
      
      const scanner = new Html5Qrcode('qr-reader');
      scannerRef.current = scanner;

      await scanner.start(
        { facingMode: 'environment' },
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
        },
        (decodedText) => {
          onScan(decodedText);
        },
        () => {
          // Ignore errors during scanning
        }
      );

      setIsScanning(true);
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
    };
  }, []);

  // Stop scanner when processing
  useEffect(() => {
    if (isProcessing && isScanning) {
      stopScanner();
    }
  }, [isProcessing, isScanning]);

  return (
    <div className="flex flex-col items-center gap-4">
      <div 
        ref={containerRef}
        className="relative w-full max-w-sm aspect-square bg-secondary rounded-2xl overflow-hidden"
      >
        <div id="qr-reader" className="w-full h-full" />
        
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
        className="w-full max-w-sm"
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
