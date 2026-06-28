import { useState, useEffect, useRef } from 'react';
import { PartnerLayout } from '@/components/partner/PartnerLayout';
import { QRScanner } from '@/components/partner/QRScanner';
import { usePartnerAuth } from '@/hooks/usePartnerAuth';
import { supabase } from '@/integrations/supabase/client';
import { Check, X, AlertTriangle } from 'lucide-react';
import { useSuccessSound } from '@/hooks/useSuccessSound';
import { useVibration } from '@/hooks/useVibration';

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
  const [showConfetti, setShowConfetti] = useState(false);
  const { playSuccessSound } = useSuccessSound();
  const { vibrateSuccess } = useVibration();
  const autoResetRef = useRef<NodeJS.Timeout | null>(null);

  // Auto-reset result after 2.5 seconds
  useEffect(() => {
    if (result) {
      autoResetRef.current = setTimeout(() => {
        setResult(null);
      }, 2500);
    }
    return () => {
      if (autoResetRef.current) clearTimeout(autoResetRef.current);
    };
  }, [result]);

  const handleScan = async (qrData: string) => {
    if (isProcessing || !shopId) return;

    setIsProcessing(true);
    setResult(null);

    try {
      let data;
      try {
        data = JSON.parse(qrData);
      } catch {
        setResult({ success: false, message: 'Неверный формат QR-кода' });
        setIsProcessing(false);
        return;
      }

      // Handle preorder QR
      if (data.type === 'subday_preorder') {
        try {
          const { data: preorder, error: fetchErr } = await supabase
            .from('preorders')
            .select('id, status, shop_id, coffee_name, syrup, user_id, qr_scanned')
            .eq('qr_code', data.qrCode)
            .maybeSingle();

          if (fetchErr || !preorder) {
            setResult({ success: false, message: 'Предзаказ не найден' });
            setIsProcessing(false);
            return;
          }

          if (preorder.shop_id !== shopId) {
            setResult({ success: false, message: 'Этот предзаказ для другой кофейни' });
            setIsProcessing(false);
            return;
          }

          if (preorder.status === 'cancelled') {
            setResult({ success: false, message: 'Этот предзаказ отменён' });
            setIsProcessing(false);
            return;
          }

          if (preorder.status === 'expired') {
            setResult({ success: false, message: 'Этот предзаказ закрыт (истёк срок)' });
            setIsProcessing(false);
            return;
          }

          if (preorder.status === 'completed' || preorder.qr_scanned) {
            setResult({ success: false, message: 'Этот QR-код уже использован' });
            setIsProcessing(false);
            return;
          }

          const { data: { user } } = await supabase.auth.getUser();
          const { error: updateErr } = await supabase
            .from('preorders')
            .update({ status: 'completed', completed_by: user?.id, completed_at: new Date().toISOString(), qr_scanned: true })
            .eq('id', preorder.id)
            .eq('qr_scanned', false);

          if (updateErr) {
            setResult({ success: false, message: 'Ошибка при обновлении предзаказа' });
            setIsProcessing(false);
            return;
          }

          const drinkDesc = preorder.syrup ? `${preorder.coffee_name} + ${preorder.syrup}` : preorder.coffee_name;
          setResult({ success: true, message: 'Предзаказ выдан!', drinkName: drinkDesc });
          setShowConfetti(true);
          playSuccessSound();
          vibrateSuccess();
          setTimeout(() => setShowConfetti(false), 2000);
        } catch (err) {
          console.error('Preorder scan error:', err);
          setResult({ success: false, message: 'Ошибка обработки предзаказа' });
        }
        setIsProcessing(false);
        return;
      }

      if (data.type !== 'subday_redeem') {
        setResult({ success: false, message: 'Это не QR-код SubDay' });
        setIsProcessing(false);
        return;
      }

      if (data.shopId !== shopId) {
        setResult({ success: false, message: 'Этот QR принадлежит другой кофейне' });
        setIsProcessing(false);
        return;
      }

      // 120s tolerance (vs. the 60s client refresh interval) to absorb clock
      // skew between the customer's and partner's devices plus scan latency.
      const now = Date.now();
      if (now - data.timestamp > 120_000) {
        setResult({ success: false, message: 'QR-код просрочен, попросите обновить' });
        setIsProcessing(false);
        return;
      }

      const { data: response, error } = await supabase.functions.invoke('partner-scan-qr', {
        body: {
          userId: data.userId,
          shopId: data.shopId,
          drinkType: data.drinkType,
          isGuestCoffee: data.isGuestCoffee || false,
        },
      });

      if (error) {
        console.error('Edge function error:', error);
        setResult({ success: false, message: 'Ошибка при обработке. Попробуйте ещё раз.' });
        setIsProcessing(false);
        return;
      }

      if (response.error) {
        setResult({ success: false, message: response.error });
      } else {
        setResult({
          success: true,
          message: 'Успешно списано!',
          customerName: response.customerName,
          drinkName: response.drinkName,
          remaining: response.remaining,
        });
        setShowConfetti(true);
        playSuccessSound();
        vibrateSuccess();
        setTimeout(() => setShowConfetti(false), 2000);
      }
    } catch (error) {
      console.error('Scan processing error:', error);
      setResult({ success: false, message: 'Произошла ошибка. Попробуйте ещё раз.' });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <PartnerLayout>
      <div className="space-y-4">
        <h2 className="text-xl font-bold text-foreground text-center px-4 pt-4">
          Сканер QR-кодов
        </h2>

        {/* Scanner is ALWAYS mounted — never unmounted/remounted */}
        <div className="px-4 relative">
          <QRScanner onScan={handleScan} isProcessing={isProcessing || result !== null} />

          {/* Result overlay on top of scanner */}
          {result && (
            <div className="absolute inset-0 flex items-center justify-center z-10">
              <div className="bg-background/95 backdrop-blur-sm rounded-2xl p-6 mx-4 w-full max-w-sm shadow-xl animate-scale-in">
                {result.success ? (
                  <SuccessResult result={result} showConfetti={showConfetti} />
                ) : (
                  <ErrorResult result={result} />
                )}
              </div>
            </div>
          )}
        </div>

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

function SuccessResult({ result, showConfetti }: { result: ScanResult; showConfetti: boolean }) {
  return (
    <div className="flex flex-col items-center gap-4 relative">
      {showConfetti && (
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          {Array.from({ length: 12 }).map((_, i) => (
            <div
              key={i}
              className="absolute animate-confetti"
              style={{
                left: `${Math.random() * 100}%`,
                top: '50%',
                animationDelay: `${Math.random() * 0.5}s`,
                fontSize: `${Math.random() * 16 + 10}px`,
              }}
            >
              {['☕', '✨', '🎉', '⭐'][Math.floor(Math.random() * 4)]}
            </div>
          ))}
        </div>
      )}

      <div className="w-20 h-20 rounded-full bg-accent flex items-center justify-center shadow-glow animate-pop">
        <Check size={40} strokeWidth={3} className="text-accent-foreground" />
      </div>

      <div className="text-center space-y-1">
        <p className="text-xl font-black text-accent">Успешно!</p>
        {result.customerName && (
          <p className="text-sm text-muted-foreground">{result.customerName}</p>
        )}
        {result.drinkName && (
          <p className="text-sm font-semibold text-foreground">{result.drinkName}</p>
        )}
      </div>
    </div>
  );
}

function ErrorResult({ result }: { result: ScanResult }) {
  return (
    <div className="flex flex-col items-center gap-4">
      <div className="w-20 h-20 rounded-full bg-destructive/20 flex items-center justify-center animate-pop">
        <X size={40} strokeWidth={3} className="text-destructive" />
      </div>
      <div className="text-center space-y-1">
        <p className="text-xl font-bold text-destructive">Ошибка</p>
        <p className="text-sm text-muted-foreground">{result.message}</p>
      </div>
    </div>
  );
}
