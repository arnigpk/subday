import { useState } from 'react';
import { PartnerLayout } from '@/components/partner/PartnerLayout';
import { QRScanner } from '@/components/partner/QRScanner';
import { usePartnerAuth } from '@/hooks/usePartnerAuth';
import { supabase } from '@/integrations/supabase/client';
import { Check, X, AlertTriangle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSuccessSound } from '@/hooks/useSuccessSound';
import { useVibration } from '@/hooks/useVibration';

type ScanStatus = 'ready' | 'scanning' | 'success' | 'error';

interface ScanResult {
  success: boolean;
  message: string;
  customerName?: string;
  drinkName?: string;
  remaining?: number;
}

export default function PartnerScanPage() {
  const { shopId } = usePartnerAuth();
  const [isProcessing, setIsProcessing] = useState(false);
  const [status, setStatus] = useState<ScanStatus>('ready');
  const [result, setResult] = useState<ScanResult | null>(null);
  const [showConfetti, setShowConfetti] = useState(false);
  const { playSuccessSound } = useSuccessSound();
  const { vibrateSuccess } = useVibration();

  const handleScan = async (qrData: string) => {
    if (isProcessing || !shopId) return;

    setIsProcessing(true);
    setStatus('scanning');
    setResult(null);

    try {
      // Parse QR data
      let data;
      try {
        data = JSON.parse(qrData);
      } catch {
        setResult({
          success: false,
          message: 'Неверный формат QR-кода',
        });
        setStatus('error');
        setIsProcessing(false);
        return;
      }

      // Validate QR structure
      if (data.type !== 'subday_redeem') {
        setResult({
          success: false,
          message: 'Это не QR-код SubDay',
        });
        setStatus('error');
        setIsProcessing(false);
        return;
      }

      // Check if QR is for this shop
      if (data.shopId !== shopId) {
        setResult({
          success: false,
          message: 'Этот QR принадлежит другой кофейне',
        });
        setStatus('error');
        setIsProcessing(false);
        return;
      }

      // Check if QR is expired (1 minute)
      const qrTimestamp = data.timestamp;
      const now = Date.now();
      const oneMinute = 1 * 60 * 1000;
      
      if (now - qrTimestamp > oneMinute) {
        setResult({
          success: false,
          message: 'QR-код просрочен, попросите обновить',
        });
        setStatus('error');
        setIsProcessing(false);
        return;
      }

      // Add scanning animation delay
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Call edge function to process redemption
      const { data: response, error } = await supabase.functions.invoke('partner-scan-qr', {
        body: {
          userId: data.userId,
          shopId: data.shopId,
          shopName: data.shopName,
          drinkType: data.drinkType,
          drinkName: data.drinkName,
          isGuestCoffee: data.isGuestCoffee || false,
        },
      });

      if (error) {
        console.error('Edge function error:', error);
        setResult({
          success: false,
          message: 'Ошибка при обработке. Попробуйте ещё раз.',
        });
        setStatus('error');
        setIsProcessing(false);
        return;
      }

      if (response.error) {
        setResult({
          success: false,
          message: response.error,
        });
        setStatus('error');
      } else {
        setResult({
          success: true,
          message: 'Напиток успешно списан!',
          customerName: response.customerName,
          drinkName: response.drinkName,
          remaining: response.remaining,
        });
        setStatus('success');
        setShowConfetti(true);
        playSuccessSound();
        vibrateSuccess();
        setTimeout(() => setShowConfetti(false), 2000);
      }
    } catch (error) {
      console.error('Scan processing error:', error);
      setResult({
        success: false,
        message: 'Произошла ошибка. Попробуйте ещё раз.',
      });
      setStatus('error');
    } finally {
      setIsProcessing(false);
    }
  };

  const resetScanner = () => {
    setResult(null);
    setStatus('ready');
  };

  return (
    <PartnerLayout>
      <div className="space-y-4">
        <h2 className="text-xl font-bold text-foreground text-center px-4 pt-4">
          Сканер QR-кодов
        </h2>

        {status === 'ready' && (
          <div className="px-4">
            <QRScanner onScan={handleScan} isProcessing={isProcessing} />
          </div>
        )}

        {status === 'scanning' && (
          <div className="flex flex-col items-center gap-6 animate-fade-in">
            <div className="w-32 h-32 rounded-full bg-primary/20 flex items-center justify-center">
              <Loader2 size={48} className="text-primary animate-spin" />
            </div>
            <div className="text-center">
              <p className="text-xl font-bold text-foreground">Обработка...</p>
              <p className="text-muted-foreground">Подождите секунду</p>
            </div>
          </div>
        )}

        {status === 'success' && result && (
          <div className="flex flex-col items-center gap-6 animate-scale-in relative">
            {/* Confetti Animation */}
            {showConfetti && (
              <div className="absolute inset-0 pointer-events-none overflow-hidden">
                {Array.from({ length: 20 }).map((_, i) => (
                  <div
                    key={i}
                    className="absolute animate-confetti"
                    style={{
                      left: `${Math.random() * 100}%`,
                      top: '50%',
                      animationDelay: `${Math.random() * 0.5}s`,
                      fontSize: `${Math.random() * 20 + 10}px`,
                    }}
                  >
                    {['☕', '✨', '🎉', '⭐'][Math.floor(Math.random() * 4)]}
                  </div>
                ))}
              </div>
            )}

            <div className="w-32 h-32 rounded-full bg-accent flex items-center justify-center shadow-glow animate-pop">
              <Check size={64} strokeWidth={3} className="text-accent-foreground" />
            </div>

            <div className="text-center space-y-2">
              <p className="text-2xl font-black text-accent">Успешно!</p>
              <p className="text-muted-foreground">{result.message}</p>
              
              <div className="mt-4 p-4 bg-secondary rounded-xl space-y-2 text-left">
                {result.customerName && (
                  <div>
                    <p className="text-sm text-muted-foreground">Клиент</p>
                    <p className="font-semibold text-foreground">{result.customerName}</p>
                  </div>
                )}
                {result.drinkName && (
                  <div>
                    <p className="text-sm text-muted-foreground">Напиток</p>
                    <p className="font-semibold text-foreground">{result.drinkName}</p>
                  </div>
                )}
              </div>
            </div>

            <Button onClick={resetScanner} size="lg" className="w-full max-w-sm">
              Сканировать ещё
            </Button>
          </div>
        )}

        {status === 'error' && result && (
          <div className="flex flex-col items-center gap-6 animate-scale-in">
            <div className="w-32 h-32 rounded-full bg-destructive/20 flex items-center justify-center animate-pop">
              <X size={64} strokeWidth={3} className="text-destructive" />
            </div>

            <div className="text-center space-y-2">
              <p className="text-2xl font-bold text-destructive">Ошибка</p>
              <p className="text-muted-foreground">{result.message}</p>
            </div>

            <Button onClick={resetScanner} size="lg" className="w-full max-w-sm">
              Попробовать ещё раз
            </Button>
          </div>
        )}

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
    </PartnerLayout>
  );
}
