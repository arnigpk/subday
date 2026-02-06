import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { User } from 'lucide-react';
import { StoryViewer } from './StoryViewer';

interface Story {
  id: string;
  user_id: string;
  image_url: string;
  created_at: string;
  expires_at: string;
  author_name: string;
  author_avatar: string | null;
}

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

export function StoryAvatar({ 
  userId, 
  userName, 
  userAvatar, 
  currentUserId,
  size = 'md',
  className = ''
}: StoryAvatarProps) {
  const [hasStory, setHasStory] = useState(false);
  const [stories, setStories] = useState<Story[]>([]);
  const [showViewer, setShowViewer] = useState(false);

  useEffect(() => {
    checkForStories();
  }, [userId]);

  const checkForStories = async () => {
    const { data, error } = await supabase
      .from('stories')
      .select('*')
      .eq('user_id', userId)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: true });

    if (!error && data && data.length > 0) {
      setHasStory(true);
      setStories(data.map(s => ({
        ...s,
        author_name: userName,
        author_avatar: userAvatar
      })));
    } else {
      setHasStory(false);
      setStories([]);
    }
  };

  const handleClick = () => {
    if (hasStory && stories.length > 0) {
      setShowViewer(true);
    }
  };

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

      {showViewer && (
        <StoryViewer
          stories={stories}
          initialIndex={0}
          currentUserId={currentUserId}
          onClose={() => setShowViewer(false)}
        />
      )}
    </>
  );
}
