import { useState } from 'react';
import { MapPin, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AddressesListProps {
  addresses: string[];
  className?: string;
  variant?: 'compact' | 'full';
}

export function AddressesList({ addresses, className, variant = 'full' }: AddressesListProps) {
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
          {addresses.map((address, index) => (
            <div key={index} className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-primary/50" />
              <span className={cn(
                'text-foreground',
                variant === 'compact' ? 'text-xs' : 'text-sm'
              )}>
                {address}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
