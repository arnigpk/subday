import { useState, useEffect } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Loader2, X } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';

interface PaymentPopupProps {
  open: boolean;
  onClose: () => void;
  paymentUrl: string | null;
}

export function PaymentPopup({ open, onClose, paymentUrl }: PaymentPopupProps) {
  const [isLoading, setIsLoading] = useState(true);
  const { t } = useLanguage();

  useEffect(() => {
    if (open) setIsLoading(true);
  }, [open, paymentUrl]);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="!max-w-[95vw] sm:!max-w-[520px] !p-0 !rounded-2xl !overflow-hidden !h-[85vh] sm:!h-[80vh]">
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
            src={paymentUrl}
            className="w-full h-full border-0"
            onLoad={() => setIsLoading(false)}
            allow="payment"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-top-navigation"
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
