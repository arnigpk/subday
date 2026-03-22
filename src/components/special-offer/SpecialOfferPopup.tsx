import { useNavigate } from 'react-router-dom';
import { GiftIcon } from '@heroicons/react/24/outline';;
import { calcDaysRemaining, formatSubscriptionExpiry } from '@/utils/formatSubscriptionDays';
import { useLanguage } from '@/contexts/LanguageContext';
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
  offerDays: number;
  eligibleUntil: Date | null;
  offerName?: string | null;
  badgeText?: string | null;
  description?: string | null;
}

export function SpecialOfferPopup({ open, onDismiss, offerPrice, offerCups, offerDays, eligibleUntil, offerName, description }: SpecialOfferPopupProps) {
  const navigate = useNavigate();
  const { language } = useLanguage();

  const formatPrice = (price: number) => new Intl.NumberFormat('ru-RU').format(price);
  
  const formatEligibleUntil = (date: Date | null) => {
    if (!date) return '';
    const days = calcDaysRemaining(date);
    return formatSubscriptionExpiry(days, date, language, 'Истёк');
  };

  const handleActivate = async () => {
    await onDismiss();
    navigate('/packages');
  };

  const displayText = description || `${offerCups} кофе за ${formatPrice(offerPrice)} ₸ — чтобы вы попробовали subday.`;

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onDismiss(); }}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-sm rounded-2xl p-4 sm:p-6">
        <DialogHeader className="text-center space-y-3">
          <div className="mx-auto w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-accent/10 flex items-center justify-center">
            <GiftIcon className="w-7 h-7 sm:w-8 sm:h-8 text-accent" />
          </div>
          <DialogTitle className="text-xl sm:text-2xl font-black">
            Спецпредложение 🎁
          </DialogTitle>
          <DialogDescription className="text-sm sm:text-base text-foreground/80 leading-relaxed">
            {displayText}
            {eligibleUntil && (
              <span className="block mt-2 text-xs sm:text-sm text-muted-foreground">
                Предложение действует {formatEligibleUntil(eligibleUntil)}
              </span>
            )}
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-2.5 mt-3 sm:mt-4">
          <Button 
            onClick={handleActivate}
            className="w-full h-11 sm:h-12 text-xs sm:text-sm font-bold bg-accent hover:bg-accent/90 text-accent-foreground tracking-wide px-3"
          >
            АКТИВИРОВАТЬ СПЕЦПРЕДЛОЖЕНИЕ🚀
          </Button>
          <Button 
            variant="ghost" 
            onClick={onDismiss}
            className="w-full text-sm text-muted-foreground"
          >
            Позже
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
