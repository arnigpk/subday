import { useNavigate } from 'react-router-dom';
import { Gift, Sparkles } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface SpecialOfferPopupProps {
  open: boolean;
  onDismiss: () => void;
  offerPrice: number;
  offerCups: number;
  eligibleUntil: Date | null;
}

export function SpecialOfferPopup({ open, onDismiss, offerPrice, offerCups, eligibleUntil }: SpecialOfferPopupProps) {
  const navigate = useNavigate();

  const formatPrice = (price: number) => new Intl.NumberFormat('ru-RU').format(price);
  
  const formatDate = (date: Date | null) => {
    if (!date) return '';
    return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
  };

  const handleActivate = async () => {
    await onDismiss();
    navigate('/packages');
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onDismiss(); }}>
      <DialogContent className="sm:max-w-md mx-4 rounded-2xl">
        <DialogHeader className="text-center space-y-4">
          <div className="mx-auto w-16 h-16 rounded-2xl bg-accent/10 flex items-center justify-center">
            <Gift className="w-8 h-8 text-accent" />
          </div>
          <DialogTitle className="text-2xl font-black">
            Спецпредложение 🎁
          </DialogTitle>
          <DialogDescription className="text-base text-foreground/80 leading-relaxed">
            {offerCups} кофе за {formatPrice(offerPrice)} ₸ — чтобы вы попробовали subday. 
            {eligibleUntil && (
              <span className="block mt-2 text-sm text-muted-foreground">
                Предложение действует до {formatDate(eligibleUntil)}
              </span>
            )}
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-3 mt-4">
          <Button 
            onClick={handleActivate}
            className="w-full h-12 text-base font-bold bg-accent hover:bg-accent/90 text-accent-foreground gap-2"
          >
            <Sparkles className="w-5 h-5" />
            Активировать спецпредложение
          </Button>
          <Button 
            variant="ghost" 
            onClick={onDismiss}
            className="w-full text-muted-foreground"
          >
            Позже
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
