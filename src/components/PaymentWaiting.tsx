import { useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { Loader2, X, ExternalLink } from 'lucide-react';

interface PaymentWaitingProps {
  paymentUrl?: string;
  onClose: () => void;
}

export function PaymentWaiting({ paymentUrl, onClose }: PaymentWaitingProps) {
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm px-6">
      <div className="w-full max-w-sm bg-background rounded-3xl shadow-xl p-8 flex flex-col items-center gap-5">
        <div className="w-16 h-16 rounded-full bg-accent/15 flex items-center justify-center">
          <Loader2 className="w-8 h-8 text-accent animate-spin" />
        </div>

        <div className="text-center">
          <p className="text-lg font-bold text-foreground mb-1">Ожидаем оплату</p>
          <p className="text-sm text-muted-foreground">
            Завершите оплату на открывшейся странице. Приложение обновится автоматически.
          </p>
        </div>

        {paymentUrl && (
          <button
            onClick={() => window.open(paymentUrl, Capacitor.isNativePlatform() ? '_system' : '_blank')}
            className="flex items-center gap-2 text-sm text-accent font-medium"
          >
            <ExternalLink size={14} />
            Открыть страницу оплаты снова
          </button>
        )}

        <button
          onClick={onClose}
          className="w-full h-11 rounded-2xl bg-secondary text-foreground text-sm font-medium flex items-center justify-center gap-2"
        >
          <X size={16} />
          Отменить
        </button>
      </div>
    </div>
  );
}
