import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ShopBadgeData {
  text: string;
  color: 'red' | 'green' | 'yellow' | string;
}

interface ShopBadgesListProps {
  badges: ShopBadgeData[];
  className?: string;
  maxVisible?: number;
}

const colorClasses: Record<string, string> = {
  red: 'bg-red-500/10 text-red-600 border-red-500/20',
  green: 'bg-green-500/10 text-green-600 border-green-500/20',
  yellow: 'bg-yellow-500/10 text-yellow-700 border-yellow-500/20',
};

export function ShopBadgesList({ badges, className, maxVisible = 1 }: ShopBadgesListProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!badges || badges.length === 0) return null;

  const visibleBadges = isExpanded ? badges : badges.slice(0, maxVisible);
  const hasMore = badges.length > maxVisible;
  const hiddenCount = badges.length - maxVisible;

  const handleToggle = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsExpanded(!isExpanded);
  };

  return (
    <div className={cn('flex flex-wrap gap-1 items-center', className)}>
      {visibleBadges.map((badge, index) => (
        <span
          key={index}
          className={cn(
            'inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border',
            colorClasses[badge.color] || colorClasses.green
          )}
        >
          {badge.text}
        </span>
      ))}
      
      {hasMore && (
        <button
          onClick={handleToggle}
          className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-secondary text-muted-foreground hover:bg-secondary/80 transition-colors"
        >
          {isExpanded ? (
            <>
              Скрыть <ChevronUp size={10} />
            </>
          ) : (
            <>
              +{hiddenCount} <ChevronDown size={10} />
            </>
          )}
        </button>
      )}
    </div>
  );
}
