import { useState } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { PreorderForm } from './PreorderForm';
import { PreorderConfirmation } from './PreorderConfirmation';

interface PreorderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shopId: string;
  shopName: string;
  coffeeRemaining: number;
  addresses: string[];
  onComplete: () => void;
}

interface PreorderResult {
  id: string;
  coffeeName: string;
  syrup: string | null;
  qrCode: string;
  createdAt: string;
}

export function PreorderDialog({ open, onOpenChange, shopId, shopName, coffeeRemaining, addresses, onComplete }: PreorderDialogProps) {
  const [result, setResult] = useState<PreorderResult | null>(null);

  const handleClose = () => {
    setResult(null);
    onOpenChange(false);
    if (result) onComplete();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className="max-w-sm mx-auto">
        {result ? (
          <PreorderConfirmation
            shopName={shopName}
            coffeeName={result.coffeeName}
            syrup={result.syrup}
            qrCode={result.qrCode}
            preorderId={result.id}
            createdAt={result.createdAt}
            onClose={handleClose}
          />
        ) : (
          <PreorderForm
            shopId={shopId}
            shopName={shopName}
            coffeeRemaining={coffeeRemaining}
            addresses={addresses}
            onSuccess={setResult}
            onCancel={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
