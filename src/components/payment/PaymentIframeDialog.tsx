import { useEffect, useRef, useState, useCallback } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface PaymentIframeDialogProps {
  open: boolean;
  paymentUrl: string | null;
  paymentOrderId: string | null;
  onClose: () => void;
  onSuccess: () => void;
}

export function PaymentIframeDialog({
  open,
  paymentUrl,
  paymentOrderId,
  onClose,
  onSuccess,
}: PaymentIframeDialogProps) {
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  // Poll payment order status while dialog is open
  useEffect(() => {
    if (!open || !paymentOrderId) return;

    const poll = async () => {
      try {
        const { data } = await supabase
          .from('payment_orders')
          .select('status')
          .eq('id', paymentOrderId)
          .single();

        if (data?.status === 'paid') {
          stopPolling();
          toast.success('🎉 Оплата прошла успешно!', {
            duration: 5000,
            description: 'Подписка активирована. Наслаждайтесь кофе!',
          });
          onSuccess();
        } else if (data?.status === 'failed') {
          stopPolling();
          toast.error('Оплата не прошла', {
            description: 'Попробуйте ещё раз или выберите другой способ оплаты.',
          });
          onClose();
        }
      } catch (e) {
        console.error('Payment poll error:', e);
      }
    };

    // Start polling every 3 seconds
    pollRef.current = setInterval(poll, 3000);

    return () => stopPolling();
  }, [open, paymentOrderId, onSuccess, onClose, stopPolling]);

  // Reset iframe loaded state when URL changes
  useEffect(() => {
    if (paymentUrl) setIframeLoaded(false);
  }, [paymentUrl]);

  if (!paymentUrl) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent
        className="max-w-[460px] w-full h-[90vh] max-h-[700px] p-0 gap-0 overflow-hidden [&>button]:hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/50">
          <span className="text-sm font-medium text-foreground">Оплата</span>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Loading overlay */}
        {!iframeLoaded && (
          <div className="absolute inset-0 flex items-center justify-center bg-background z-10 mt-12">
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <span className="text-sm text-muted-foreground">Загрузка формы оплаты...</span>
            </div>
          </div>
        )}

        {/* Iframe */}
        <iframe
          src={paymentUrl}
          className="w-full flex-1 border-0"
          style={{ minHeight: 0 }}
          allow="payment *"
          referrerPolicy="strict-origin-when-cross-origin"
          onLoad={() => setIframeLoaded(true)}
        />
      </DialogContent>
    </Dialog>
  );
}
