import { useState, memo } from 'react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { User } from 'lucide-react';
import { StoryViewer } from './StoryViewer';
import { useStoriesCache } from '@/hooks/useStoriesCache';

interface StoryAvatarProps {
  userId: string;
  userName: string;
  userAvatar: string | null;
  currentUserId: string | null;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const sizeClasses = {
  sm: 'w-8 h-8',
  md: 'w-11 h-11',
  lg: 'w-16 h-16',
};

const ringClasses = {
  sm: 'ring-[2px]',
  md: 'ring-[3px]',
  lg: 'ring-[3px]',
};

export const StoryAvatar = memo(function StoryAvatar({ 
  userId, 
  userName, 
  userAvatar, 
  currentUserId,
  size = 'md',
  className = ''
}: StoryAvatarProps) {
  const { hasStory, stories, invalidateCache } = useStoriesCache(userId);
  const [showViewer, setShowViewer] = useState(false);

  const handleClick = () => {
    if (hasStory && stories.length > 0) {
      setShowViewer(true);
    }
  };

  const enrichedStories = stories.map(s => ({
    ...s,
    author_name: userName,
    author_avatar: userAvatar
  }));

  return (
    <>
      <div 
        className={`relative ${hasStory ? 'cursor-pointer' : ''} ${className}`}
        onClick={handleClick}
      >
        <Avatar 
          className={`${sizeClasses[size]} ${
            hasStory 
              ? `${ringClasses[size]} ring-accent ring-offset-2 ring-offset-background` 
              : ''
          }`}
        >
          {userAvatar ? (
            <AvatarImage src={userAvatar} alt={userName} className="object-cover" />
          ) : null}
          <AvatarFallback className="bg-primary/10">
            <User size={size === 'lg' ? 24 : size === 'md' ? 20 : 14} className="text-primary" />
          </AvatarFallback>
        </Avatar>
        
        {/* Story indicator dot */}
        {hasStory && (
          <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-accent rounded-full border-2 border-background" />
        )}
      </div>

      {showViewer && enrichedStories.length > 0 && (
        <StoryViewer
          stories={enrichedStories}
          initialIndex={0}
          currentUserId={currentUserId}
          onClose={() => setShowViewer(false)}
          onStoryDeleted={invalidateCache}
        />
      )}
    </>
  );
});
