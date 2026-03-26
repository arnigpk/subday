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
  /** If true, payment was opened externally — show waiting UI instead of iframe */
  externalMode?: boolean;
}

export function PaymentIframeDialog({
  open,
  paymentUrl,
  paymentOrderId,
  onClose,
  onSuccess,
  externalMode = false,
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

    pollRef.current = setInterval(poll, 3000);
    return () => stopPolling();
  }, [open, paymentOrderId, onSuccess, onClose, stopPolling]);

  // Reset iframe loaded state when URL changes
  useEffect(() => {
    if (paymentUrl) setIframeLoaded(false);
  }, [paymentUrl]);

  if (!paymentUrl && !externalMode) return null;
  if (!open) return null;

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

        {externalMode ? (
          /* External mode: payment opened in browser, show waiting UI */
          <div className="flex-1 flex flex-col items-center justify-center gap-4 p-6">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
            <div className="text-center space-y-2">
              <p className="text-base font-medium text-foreground">Ожидание оплаты...</p>
              <p className="text-sm text-muted-foreground">
                Страница оплаты открыта в браузере. После завершения оплаты это окно обновится автоматически.
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => {
              if (paymentUrl) {
                const tg = window.Telegram?.WebApp;
                if (tg) {
                  (tg as any).openLink?.(paymentUrl);
                } else {
                  window.open(paymentUrl, '_blank');
                }
              }
            }}>
              Открыть заново
            </Button>
          </div>
        ) : (
          <>
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
              src={paymentUrl!}
              className="w-full flex-1 border-0"
              style={{ minHeight: 0 }}
              allow="payment *"
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-top-navigation"
              referrerPolicy="strict-origin-when-cross-origin"
              onLoad={() => setIframeLoaded(true)}
            />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
