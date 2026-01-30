import { cn } from '@/lib/utils';

interface ShopBadgeProps {
  text: string;
  color: 'red' | 'green' | 'yellow' | string;
  className?: string;
}

const colorClasses: Record<string, string> = {
  red: 'bg-red-500/10 text-red-600 border-red-500/20',
  green: 'bg-green-500/10 text-green-600 border-green-500/20',
  yellow: 'bg-yellow-500/10 text-yellow-700 border-yellow-500/20',
};

export function ShopBadge({ text, color, className }: ShopBadgeProps) {
  const colorClass = colorClasses[color] || colorClasses.green;
  
  return (
    <span 
      className={cn(
        'inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border',
        colorClass,
        className
      )}
    >
      {text}
    </span>
  );
}
