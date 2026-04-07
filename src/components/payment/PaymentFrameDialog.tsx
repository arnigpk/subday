import { Dialog, DialogContent } from '@/components/ui/dialog';
import { X, Loader2 } from 'lucide-react';
import { useState } from 'react';

interface PaymentFrameDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  paymentUrl: string | null;
}

export function PaymentFrameDialog({ open, onOpenChange, paymentUrl }: PaymentFrameDialogProps) {
  const [isLoading, setIsLoading] = useState(true);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg w-[calc(100%-1rem)] h-[85vh] p-0 gap-0 rounded-2xl overflow-hidden border-border/50">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/30 bg-background shrink-0">
          <span className="text-sm font-semibold text-foreground">Оплата</span>
          <button
            onClick={() => onOpenChange(false)}
            className="p-1.5 rounded-full text-muted-foreground hover:bg-secondary transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 relative">
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-background z-10">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          )}
          {paymentUrl && (
            <iframe
              src={paymentUrl}
              className="w-full h-full border-0"
              onLoad={() => setIsLoading(false)}
              allow="payment"
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-top-navigation"
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
