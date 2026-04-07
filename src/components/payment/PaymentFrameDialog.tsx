import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X, Loader2 } from 'lucide-react';
import { useState, useRef, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

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
    <DialogPrimitive.Root open={open} onOpenChange={(v) => { if (!v) handleClose(); else onOpenChange(v); }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'transparent', border: 'none', boxShadow: 'none' }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 350, damping: 28, mass: 0.8 }}
            className={cn(
              "relative w-[calc(100%-1rem)] sm:max-w-lg h-[85vh] rounded-2xl overflow-hidden border border-border/40",
              "backdrop-blur-xl bg-background/75 shadow-[0_8px_32px_hsl(var(--foreground)/0.1),inset_0_1px_0_hsl(var(--background)/0.5)]",
              "flex flex-col"
            )}
          >
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
          </motion.div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
