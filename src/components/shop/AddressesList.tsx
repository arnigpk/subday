import { useState } from 'react';
import { MapPin, ChevronDown, ChevronUp, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { isShopOpen } from '@/utils/shopHours';

interface AddressesListProps {
  addresses: string[];
  className?: string;
  variant?: 'compact' | 'full';
  closestIndex?: number;
  coordinates?: Array<{ lat?: number | null; lng?: number | null; working_hours?: string }>;
  shopWorkingHours?: string;
}

export function AddressesList({ addresses, className, variant = 'full', closestIndex, coordinates, shopWorkingHours }: AddressesListProps) {
  const [isOpen, setIsOpen] = useState(false);

  const getHoursForIndex = (index: number): string | null => {
    const coordHours = coordinates?.[index]?.working_hours;
    if (coordHours && coordHours.trim()) return coordHours;
    return null;
  };

  // Check if all addresses share the same working hours
  const getUnifiedHours = (): string | null => {
    if (addresses.length <= 1) return null;
    const hoursList = addresses.map((_, i) => getHoursForIndex(i) || shopWorkingHours || null);
    const unique = new Set(hoursList.filter(Boolean));
    if (unique.size === 1) return [...unique][0]!;
    return null; // different hours per address
  };

  if (addresses.length === 0) {
    return (
      <div className={cn('flex items-center gap-1.5 text-muted-foreground', className)}>
        <MapPin size={variant === 'compact' ? 12 : 16} className="shrink-0" />
        <span className={variant === 'compact' ? 'text-xs' : 'text-sm'}>Адрес не указан</span>
      </div>
    );
  }

  if (addresses.length === 1) {
    const hours = getHoursForIndex(0) || shopWorkingHours;
    return (
      <div className={cn('space-y-1', className)}>
        <div className="flex items-center gap-1.5">
          <MapPin size={variant === 'compact' ? 12 : 14} className="text-muted-foreground shrink-0" />
          <span className={cn(
            'truncate',
            variant === 'compact' ? 'text-xs text-muted-foreground' : 'text-sm font-medium text-foreground'
          )}>
            {addresses[0]}
          </span>
        </div>
        {hours && (
          <div className="flex items-center gap-1.5">
            <Clock size={variant === 'compact' ? 12 : 14} className="text-muted-foreground shrink-0" />
            <span className={cn('text-xs', isShopOpen(hours) ? 'text-emerald-600' : 'text-muted-foreground')}>
              {hours}
            </span>
          </div>
        )}
      </div>
    );
  }

  const handleTriggerClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsOpen(!isOpen);
  };

  const unifiedHours = getUnifiedHours();
  const hasUnifiedHours = unifiedHours !== null;

  return (
    <div className={className}>
      <button
        type="button"
        onClick={handleTriggerClick}
        className="flex items-center gap-1.5 group cursor-pointer w-full text-left"
      >
        <MapPin size={variant === 'compact' ? 12 : 14} className="text-muted-foreground shrink-0" />
        <span className={cn(
          'text-primary hover:underline',
          variant === 'compact' ? 'text-xs' : 'text-sm font-medium'
        )}>
          Выбрать адрес ({addresses.length})
        </span>
        {isOpen ? (
          <ChevronUp size={14} className="text-muted-foreground" />
        ) : (
          <ChevronDown size={14} className="text-muted-foreground" />
        )}
      </button>
      {isOpen && (
        <div className="mt-1.5 space-y-1 pl-[22px]">
          {(() => {
            const indices = addresses.map((_, i) => i);
            if (closestIndex != null) {
              indices.sort((a, b) => (a === closestIndex ? -1 : b === closestIndex ? 1 : 0));
            }
            return indices.map((index) => {
              const isClosest = closestIndex != null && index === closestIndex;
              const hours = !hasUnifiedHours ? (getHoursForIndex(index) || shopWorkingHours) : null;
              return (
                <div key={index} className="space-y-0.5">
                  <div className="flex items-center gap-1.5">
                    {(() => {
                      const addrHours = getHoursForIndex(index) || shopWorkingHours;
                      const addrOpen = addrHours ? isShopOpen(addrHours) : false;
                      const dotColor = isClosest ? (addrOpen ? "bg-green-600" : "bg-destructive") : (addrOpen ? "bg-primary/50" : "bg-destructive");
                      return <div className={cn("w-1.5 h-1.5 rounded-full shrink-0", dotColor)} />;
                    })()}
                    <span className={cn(
                      isClosest ? 'text-green-700 dark:text-green-500 font-medium' : 'text-foreground',
                      variant === 'compact' ? 'text-xs' : 'text-sm'
                    )}>
                      {addresses[index]}
                    </span>
                  </div>
                  {hours && (
                    <div className="flex items-center gap-1.5 pl-3">
                      <Clock size={10} className="text-muted-foreground shrink-0" />
                      <span className={cn('text-xs', isShopOpen(hours) ? 'text-emerald-600' : 'text-muted-foreground')}>
                        {hours}
                      </span>
                    </div>
                  )}
                </div>
              );
            });
          })()}
          {hasUnifiedHours && (
            <div className="flex items-center gap-1.5 pt-0.5">
              <Clock size={variant === 'compact' ? 12 : 14} className="text-muted-foreground shrink-0" />
              <span className={cn('text-xs', isShopOpen(unifiedHours) ? 'text-emerald-600' : 'text-muted-foreground')}>
                {unifiedHours}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
