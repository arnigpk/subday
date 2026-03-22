import { useState, memo } from 'react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { UserIcon } from '@heroicons/react/24/outline';;
import { supabase } from '@/integrations/supabase/client';
import { StoryViewer } from './StoryViewer';
import { useStoriesCache } from '@/hooks/useStoriesCache';
import { useVibration } from '@/hooks/useVibration';

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
  const [startIndex, setStartIndex] = useState(0);
  const { vibrateShort } = useVibration();

  const handleClick = async () => {
    if (!hasStory || stories.length === 0) return;

    vibrateShort();

    let initialIndex = 0;
    if (currentUserId) {
      const storyIds = stories.map((story) => story.id);
      const { data: viewedStories } = await supabase
        .from('story_views')
        .select('story_id')
        .eq('user_id', currentUserId)
        .in('story_id', storyIds);

      const viewedStoryIds = new Set((viewedStories || []).map((story) => story.story_id));
      const firstUnviewedIndex = stories.findIndex((story) => !viewedStoryIds.has(story.id));
      initialIndex = firstUnviewedIndex === -1 ? 0 : firstUnviewedIndex;
    }

    setStartIndex(initialIndex);
    setShowViewer(true);
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
            <UserIcon size={size === 'lg' ? 24 : size === 'md' ? 20 : 14} className="text-primary" />
          </AvatarFallback>
        </Avatar>
        
        {hasStory && (
          <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-accent rounded-full border-2 border-background" />
        )}
      </div>

      {showViewer && enrichedStories.length > 0 && (
        <StoryViewer
          stories={enrichedStories}
          initialIndex={startIndex}
          currentUserId={currentUserId}
          onClose={() => setShowViewer(false)}
          onStoryDeleted={invalidateCache}
        />
      )}
    </>
  );
});
