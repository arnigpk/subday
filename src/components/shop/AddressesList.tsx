import { useState } from 'react';
import { MapPin, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AddressesListProps {
  addresses: string[];
  className?: string;
  variant?: 'compact' | 'full';
  closestIndex?: number;
}

export function AddressesList({ addresses, className, variant = 'full', closestIndex }: AddressesListProps) {
  const [isOpen, setIsOpen] = useState(false);

  if (addresses.length === 0) {
    return (
      <div className={cn('flex items-center gap-1 text-muted-foreground', className)}>
        <MapPin size={variant === 'compact' ? 12 : 16} className="shrink-0" />
        <span className={variant === 'compact' ? 'text-xs' : 'text-sm'}>Адрес не указан</span>
      </div>
    );
  }

  if (addresses.length === 1) {
    return (
      <div className={cn('flex items-center gap-1', className)}>
        <MapPin size={variant === 'compact' ? 12 : 16} className="text-muted-foreground shrink-0" />
        <span className={cn(
          'truncate',
          variant === 'compact' ? 'text-xs text-muted-foreground' : 'text-sm font-medium text-foreground'
        )}>
          {addresses[0]}
        </span>
      </div>
    );
  }

  // Multiple addresses - show collapsible
  const handleTriggerClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsOpen(!isOpen);
  };

  return (
    <div className={className}>
      <button
        type="button"
        onClick={handleTriggerClick}
        className="flex items-center gap-1 group cursor-pointer w-full text-left"
      >
        <MapPin size={variant === 'compact' ? 12 : 16} className="text-muted-foreground shrink-0" />
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
        <div className="mt-2 space-y-1.5 pl-5 border-l-2 border-primary/20 ml-2">
          {(() => {
            const indices = addresses.map((_, i) => i);
            if (closestIndex != null) {
              indices.sort((a, b) => (a === closestIndex ? -1 : b === closestIndex ? 1 : 0));
            }
            return indices.map((index) => {
              const isClosest = closestIndex != null && index === closestIndex;
              return (
                <div key={index} className="flex items-center gap-1.5">
                  <div className={cn("w-1.5 h-1.5 rounded-full", isClosest ? "bg-green-600" : "bg-primary/50")} />
                  <span className={cn(
                    isClosest ? 'text-green-700 dark:text-green-500 font-medium' : 'text-foreground',
                    variant === 'compact' ? 'text-xs' : 'text-sm'
                  )}>
                    {addresses[index]}
                  </span>
                </div>
              );
            });
          })()}
        </div>
      )}
    </div>
  );
}
