import { Dialog, DialogContent } from '@/components/ui/dialog';
import { X, Loader2 } from 'lucide-react';
import { useState, useRef, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface PaymentFrameDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  paymentUrl: string | null;
  orderId?: string | null;
}

export function PaymentFrameDialog({ open, onOpenChange, paymentUrl, orderId }: PaymentFrameDialogProps) {
  const [isLoading, setIsLoading] = useState(true);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval>>();

  const handleClose = useCallback((success?: boolean) => {
    if (pollRef.current) clearInterval(pollRef.current);
    onOpenChange(false);
    if (success) {
      toast.success('🎉 Подписка успешно активирована!', {
        duration: 5000,
        description: 'Спасибо за покупку! Наслаждайтесь кофе.',
      });
      setTimeout(() => window.location.reload(), 1500);
    }
  }, [onOpenChange]);

  // Poll order status when dialog is open
  useEffect(() => {
    if (!open || !orderId) return;

    pollRef.current = setInterval(async () => {
      try {
        const { data } = await supabase.functions.invoke('verify-payment', {
          body: { order_id: orderId },
        });
        if (data?.success) {
          handleClose(true);
        }
      } catch {}
    }, 4000);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [open, orderId, handleClose]);

  // Reset loading state when URL changes
  useEffect(() => {
    if (paymentUrl) setIsLoading(true);
  }, [paymentUrl]);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); else onOpenChange(v); }}>
      <DialogContent className="sm:max-w-lg w-[calc(100%-1rem)] h-[85vh] p-0 gap-0 rounded-2xl overflow-hidden border-border/50 flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/30 bg-background shrink-0">
          <span className="text-sm font-semibold text-foreground">Оплата</span>
          <button
            onClick={() => handleClose()}
            className="p-1.5 rounded-full text-muted-foreground hover:bg-secondary transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 relative min-h-0">
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-background z-10">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          )}
          {paymentUrl && (
            <iframe
              ref={iframeRef}
              src={paymentUrl}
              className="w-full h-full border-0"
              onLoad={() => setIsLoading(false)}
              allow="payment"
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
