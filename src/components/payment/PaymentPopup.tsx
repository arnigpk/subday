import { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Loader2, ExternalLink, CheckCircle2 } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import * as VisuallyHidden from '@radix-ui/react-visually-hidden';

interface PaymentPopupProps {
  open: boolean;
  onClose: () => void;
  paymentUrl: string | null;
}

export function PaymentPopup({ open, onClose, paymentUrl }: PaymentPopupProps) {
  const [status, setStatus] = useState<'waiting' | 'checking' | 'success' | 'failed'>('waiting');
  const paymentWindowRef = useRef<Window | null>(null);
  const { t } = useLanguage();

  // Open payment in new window when popup opens
  useEffect(() => {
    if (open && paymentUrl) {
      setStatus('waiting');
      paymentWindowRef.current = window.open(paymentUrl, '_blank');
    }
    return () => {
      paymentWindowRef.current = null;
    };
  }, [open, paymentUrl]);

  // Poll for payment completion
  useEffect(() => {
    if (!open || status === 'success' || status === 'failed') return;

    // Start polling after 10 seconds
    const startTimeout = setTimeout(() => {
      const interval = setInterval(async () => {
        setStatus('checking');
        try {
          const { data, error } = await supabase.functions.invoke('verify-payment');
          if (!error && data?.success) {
            setStatus('success');
            toast.success('🎉 Подписка успешно активирована!', {
              duration: 5000,
              description: 'Спасибо за покупку! Наслаждайтесь кофе.',
            });
            clearInterval(interval);
            setTimeout(() => {
              onClose();
              window.location.reload();
            }, 2000);
          }
        } catch {
          // ignore, keep polling
        }
      }, 5000);

      return () => clearInterval(interval);
    }, 10000);

    return () => clearTimeout(startTimeout);
  }, [open, status, onClose]);

  const handleOpenPayment = () => {
    if (paymentUrl) {
      paymentWindowRef.current = window.open(paymentUrl, '_blank');
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="!max-w-[90vw] sm:!max-w-[420px] !rounded-2xl">
        <VisuallyHidden.Root>
          <DialogTitle>Оплата</DialogTitle>
        </VisuallyHidden.Root>

        <div className="flex flex-col items-center text-center py-4 gap-5">
          {status === 'success' ? (
            <>
              <div className="w-16 h-16 rounded-full bg-accent/15 flex items-center justify-center">
                <CheckCircle2 className="w-8 h-8 text-accent" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-foreground mb-1">Оплата прошла!</h3>
                <p className="text-sm text-muted-foreground">Подписка активирована. Страница обновится автоматически.</p>
              </div>
            </>
          ) : (
            <>
              <div className="w-16 h-16 rounded-full bg-accent/15 flex items-center justify-center">
                <Loader2 className="w-8 h-8 text-accent animate-spin" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-foreground mb-1">Ожидание оплаты</h3>
                <p className="text-sm text-muted-foreground">
                  Страница оплаты открыта в новом окне. После оплаты подписка активируется автоматически.
                </p>
              </div>

              <Button
                onClick={handleOpenPayment}
                variant="outline"
                className="gap-2"
              >
                <ExternalLink size={16} />
                Открыть страницу оплаты
              </Button>

              <p className="text-xs text-muted-foreground/60">
                {status === 'checking' ? 'Проверяем статус оплаты...' : 'Проверка начнётся автоматически'}
              </p>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
