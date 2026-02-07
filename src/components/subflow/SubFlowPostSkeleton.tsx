import { Skeleton } from '@/components/ui/skeleton';

interface SubFlowPostSkeletonProps {
  count?: number;
}

export function SubFlowPostSkeleton({ count = 3 }: SubFlowPostSkeletonProps) {
  return (
    <div className="space-y-4">
      {Array.from({ length: count }).map((_, index) => (
        <div 
          key={index} 
          className="card-static animate-pulse"
          style={{ animationDelay: `${index * 0.1}s` }}
        >
          {/* Author header */}
          <div className="flex items-center gap-3 mb-3">
            <Skeleton className="w-11 h-11 rounded-full" />
            <div className="flex-1">
              <Skeleton className="h-4 w-28 mb-1.5" />
              <Skeleton className="h-3 w-20" />
            </div>
          </div>

          {/* Content */}
          <div className="space-y-2 mb-3">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-4/5" />
            <Skeleton className="h-4 w-2/3" />
          </div>

          {/* Image placeholder (random - some have, some don't) */}
          {index % 2 === 0 && (
            <Skeleton className="w-full h-48 rounded-xl mb-3" />
          )}

          {/* Reactions */}
          <div className="flex gap-2 mb-3">
            {['💚', '👍', '🔥'].map((emoji) => (
              <Skeleton key={emoji} className="h-8 w-14 rounded-full" />
            ))}
          </div>

          {/* Comments button */}
          <Skeleton className="h-4 w-24" />
        </div>
      ))}
    </div>
  );
}
