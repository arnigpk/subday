import { useState } from 'react';
import { PartnerLayout } from '@/components/partner/PartnerLayout';
import { QRScanner } from '@/components/partner/QRScanner';
import { usePartnerAuth } from '@/hooks/usePartnerAuth';
import { supabase } from '@/integrations/supabase/client';
import { Check, X, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

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
  const [result, setResult] = useState<ScanResult | null>(null);

  const handleScan = async (qrData: string) => {
    if (isProcessing || !shopId) return;

    setIsProcessing(true);
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
        setIsProcessing(false);
        return;
      }

      // Validate QR structure
      if (data.type !== 'subday_redeem') {
        setResult({
          success: false,
          message: 'Это не QR-код SubDay',
        });
        setIsProcessing(false);
        return;
      }

      // Check if QR is for this shop
      if (data.shopId !== shopId) {
        setResult({
          success: false,
          message: 'Этот QR принадлежит другой кофейне',
        });
        setIsProcessing(false);
        return;
      }

      // Check if QR is expired (5 minutes)
      const qrTimestamp = data.timestamp;
      const now = Date.now();
      const fiveMinutes = 5 * 60 * 1000;
      
      if (now - qrTimestamp > fiveMinutes) {
        setResult({
          success: false,
          message: 'QR-код просрочен, попросите обновить',
        });
        setIsProcessing(false);
        return;
      }

      // Call edge function to process redemption
      const { data: response, error } = await supabase.functions.invoke('partner-scan-qr', {
        body: {
          userId: data.userId,
          shopId: data.shopId,
          shopName: data.shopName,
          drinkType: data.drinkType,
          drinkName: data.drinkName,
        },
      });

      if (error) {
        console.error('Edge function error:', error);
        setResult({
          success: false,
          message: 'Ошибка при обработке. Попробуйте ещё раз.',
        });
        setIsProcessing(false);
        return;
      }

      if (response.error) {
        setResult({
          success: false,
          message: response.error,
        });
      } else {
        setResult({
          success: true,
          message: 'Напиток успешно списан!',
          customerName: response.customerName,
          drinkName: response.drinkName,
          remaining: response.remaining,
        });
      }
    } catch (error) {
      console.error('Scan processing error:', error);
      setResult({
        success: false,
        message: 'Произошла ошибка. Попробуйте ещё раз.',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const resetScanner = () => {
    setResult(null);
  };

  return (
    <PartnerLayout>
      <div className="p-4 space-y-6">
        <h2 className="text-xl font-bold text-foreground text-center">
          Сканер QR-кодов
        </h2>

        {result ? (
          <div className="flex flex-col items-center gap-6">
            <div
              className={`w-32 h-32 rounded-full flex items-center justify-center ${
                result.success
                  ? 'bg-accent text-accent-foreground'
                  : 'bg-destructive/20 text-destructive'
              }`}
            >
              {result.success ? (
                <Check size={64} strokeWidth={3} />
              ) : (
                <X size={64} strokeWidth={3} />
              )}
            </div>

            <div className="text-center space-y-2">
              <p className={`text-xl font-bold ${result.success ? 'text-accent' : 'text-destructive'}`}>
                {result.success ? 'Успешно!' : 'Ошибка'}
              </p>
              <p className="text-muted-foreground">{result.message}</p>
              
              {result.success && result.customerName && (
                <div className="mt-4 p-4 bg-secondary rounded-xl space-y-2">
                  <p className="text-sm text-muted-foreground">Клиент</p>
                  <p className="font-semibold text-foreground">{result.customerName}</p>
                  {result.drinkName && (
                    <>
                      <p className="text-sm text-muted-foreground mt-2">Напиток</p>
                      <p className="font-semibold text-foreground">{result.drinkName}</p>
                    </>
                  )}
                  {result.remaining !== undefined && (
                    <>
                      <p className="text-sm text-muted-foreground mt-2">Осталось напитков</p>
                      <p className="font-semibold text-foreground">{result.remaining}</p>
                    </>
                  )}
                </div>
              )}
            </div>

            <Button onClick={resetScanner} size="lg" className="w-full max-w-sm">
              Сканировать ещё
            </Button>
          </div>
        ) : (
          <QRScanner onScan={handleScan} isProcessing={isProcessing} />
        )}

        <div className="flex items-start gap-3 p-4 bg-amber-500/10 rounded-xl">
          <AlertTriangle size={20} className="text-amber-500 shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-medium text-foreground mb-1">Важно!</p>
            <p className="text-muted-foreground">
              QR-код действителен 5 минут. Убедитесь, что клиент показывает свежий код.
            </p>
          </div>
        </div>
      </div>
    </PartnerLayout>
  );
}
