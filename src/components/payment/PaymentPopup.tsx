import { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Loader2, X } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import * as VisuallyHidden from '@radix-ui/react-visually-hidden';

interface PaymentPopupProps {
  open: boolean;
  onClose: () => void;
  paymentUrl: string | null;
}

export function PaymentPopup({ open, onClose, paymentUrl }: PaymentPopupProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [paymentCompleted, setPaymentCompleted] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const { t } = useLanguage();

  useEffect(() => {
    if (open) {
      setIsLoading(true);
      setPaymentCompleted(false);
    }
  }, [open, paymentUrl]);

  // Listen for iframe URL changes - when it redirects to our success/failure URL
  useEffect(() => {
    if (!open || paymentCompleted) return;

    const handleMessage = (event: MessageEvent) => {
      // Some payment providers send postMessage on completion
      if (event.data?.type === 'payment_success' || event.data?.status === 'success') {
        handlePaymentSuccess();
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [open, paymentCompleted]);

  // Poll for payment status - but only check actual Paylink API status, not time-based
  useEffect(() => {
    if (!open || paymentCompleted) return;

    // Start polling after 15 seconds (give user time to pay)
    const startDelay = setTimeout(() => {
      const interval = setInterval(async () => {
        try {
          const { data, error } = await supabase.functions.invoke('verify-payment');
          if (!error && data?.success) {
            handlePaymentSuccess();
            clearInterval(interval);
          }
        } catch {
          // ignore
        }
      }, 6000);

      return () => clearInterval(interval);
    }, 15000);

    return () => clearTimeout(startDelay);
  }, [open, paymentCompleted]);

  const handlePaymentSuccess = () => {
    if (paymentCompleted) return;
    setPaymentCompleted(true);
    toast.success('🎉 Подписка успешно активирована!', {
      duration: 5000,
      description: 'Спасибо за покупку! Наслаждайтесь кофе.',
    });
    onClose();
    setTimeout(() => window.location.reload(), 1500);
  };

  // Detect when iframe navigates to success/failure URL
  const handleIframeLoad = () => {
    setIsLoading(false);
    
    try {
      const iframe = iframeRef.current;
      if (iframe?.contentWindow) {
        const url = iframe.contentWindow.location.href;
        if (url.includes('payment=success')) {
          handlePaymentSuccess();
        } else if (url.includes('payment=failed')) {
          toast.error('Оплата не прошла', {
            description: 'Попробуйте ещё раз или выберите другой способ оплаты.',
          });
          onClose();
        }
      }
    } catch {
      // Cross-origin - can't access iframe URL, that's fine
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="!max-w-[95vw] sm:!max-w-[520px] !p-0 !rounded-2xl !overflow-hidden !h-[85vh] sm:!h-[80vh]">
        <VisuallyHidden.Root>
          <DialogTitle>Оплата</DialogTitle>
        </VisuallyHidden.Root>

        {/* Custom close button */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-20 w-8 h-8 rounded-full bg-background/80 backdrop-blur-sm border border-border/40 flex items-center justify-center hover:bg-foreground/10 transition-colors"
        >
          <X size={16} className="text-foreground" />
        </button>

        {/* Loading overlay */}
        {isLoading && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-background/90 backdrop-blur-sm gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-accent" />
            <p className="text-sm text-muted-foreground">{t('packageDetail.creating')}</p>
          </div>
        )}

        {/* Payment iframe */}
        {paymentUrl && (
          <iframe
            ref={iframeRef}
            src={paymentUrl}
            className="w-full h-full border-0"
            onLoad={handleIframeLoad}
            allow="payment"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-top-navigation"
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
