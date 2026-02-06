import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { X, Heart, Eye, Trash2 } from 'lucide-react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { User } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ru } from 'date-fns/locale';
import { toast } from 'sonner';

interface Story {
  id: string;
  user_id: string;
  image_url: string;
  created_at: string;
  expires_at: string;
  author_name: string;
  author_avatar: string | null;
}

interface StoryViewerProps {
  stories: Story[];
  initialIndex: number;
  currentUserId: string | null;
  onClose: () => void;
  onStoryDeleted?: () => void;
}

export function StoryViewer({ stories, initialIndex, currentUserId, onClose, onStoryDeleted }: StoryViewerProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [viewCount, setViewCount] = useState(0);
  const [likesCount, setLikesCount] = useState(0);
  const [hasLiked, setHasLiked] = useState(false);
  const [progress, setProgress] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);

  const story = stories[currentIndex];
  const isOwner = currentUserId === story?.user_id;

  useEffect(() => {
    if (!story) return;
    
    // Reset progress
    setProgress(0);
    
    // Auto-progress timer (5 seconds per story)
    const duration = 5000;
    const interval = 50;
    let elapsed = 0;
    
    const timer = setInterval(() => {
      elapsed += interval;
      setProgress((elapsed / duration) * 100);
      
      if (elapsed >= duration) {
        if (currentIndex < stories.length - 1) {
          setCurrentIndex(prev => prev + 1);
        } else {
          onClose();
        }
      }
    }, interval);

    // Record view
    if (currentUserId && !isOwner) {
      recordView();
    }
    
    // Fetch stats
    fetchStats();

    return () => clearInterval(timer);
  }, [currentIndex, story?.id]);

  const recordView = async () => {
    if (!story || !currentUserId) return;
    
    try {
      await supabase
        .from('story_views')
        .upsert({
          story_id: story.id,
          user_id: currentUserId
        }, { onConflict: 'story_id,user_id' });
    } catch (error) {
      console.error('Error recording view:', error);
    }
  };

  const fetchStats = async () => {
    if (!story) return;

    // Fetch view count
    const { count: views } = await supabase
      .from('story_views')
      .select('*', { count: 'exact', head: true })
      .eq('story_id', story.id);
    
    setViewCount(views || 0);

    // Fetch likes count
    const { count: likes } = await supabase
      .from('story_likes')
      .select('*', { count: 'exact', head: true })
      .eq('story_id', story.id);
    
    setLikesCount(likes || 0);

    // Check if current user liked
    if (currentUserId) {
      const { data: liked } = await supabase
        .from('story_likes')
        .select('id')
        .eq('story_id', story.id)
        .eq('user_id', currentUserId)
        .single();
      
      setHasLiked(!!liked);
    }
  };

  const handleLike = async () => {
    if (!story || !currentUserId || isOwner) return;

    if (hasLiked) {
      await supabase
        .from('story_likes')
        .delete()
        .eq('story_id', story.id)
        .eq('user_id', currentUserId);
      
      setHasLiked(false);
      setLikesCount(prev => prev - 1);
    } else {
      await supabase
        .from('story_likes')
        .insert({
          story_id: story.id,
          user_id: currentUserId
        });
      
      setHasLiked(true);
      setLikesCount(prev => prev + 1);
    }
  };

  const handlePrevious = () => {
    if (currentIndex > 0) {
      setCurrentIndex(prev => prev - 1);
    }
  };

  const handleNext = () => {
    if (currentIndex < stories.length - 1) {
      setCurrentIndex(prev => prev + 1);
    } else {
      onClose();
    }
  };

  if (!story) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black flex items-center justify-center">
      {/* Progress bars */}
      <div className="absolute top-0 left-0 right-0 flex gap-1 p-2 z-20">
        {stories.map((_, index) => (
          <div key={index} className="flex-1 h-1 bg-white/30 rounded-full overflow-hidden">
            <div 
              className="h-full bg-white transition-all duration-50"
              style={{ 
                width: index < currentIndex ? '100%' : index === currentIndex ? `${progress}%` : '0%' 
              }}
            />
          </div>
        ))}
      </div>

      {/* Header */}
      <div className="absolute top-6 left-0 right-0 flex items-center justify-between px-4 z-20">
        <div className="flex items-center gap-3">
          <Avatar className="w-10 h-10 ring-2 ring-white/50">
            {story.author_avatar ? (
              <AvatarImage src={story.author_avatar} alt={story.author_name} />
            ) : null}
            <AvatarFallback className="bg-primary/20">
              <User size={16} className="text-white" />
            </AvatarFallback>
          </Avatar>
          <div>
            <p className="text-white font-medium text-sm">{story.author_name}</p>
            <p className="text-white/60 text-xs">
              {formatDistanceToNow(new Date(story.created_at), { addSuffix: true, locale: ru })}
            </p>
          </div>
        </div>
        <button onClick={onClose} className="p-2 text-white/80 hover:text-white">
          <X size={24} />
        </button>
      </div>

      {/* Story image */}
      <img 
        src={story.image_url} 
        alt="Story" 
        className="max-w-full max-h-full object-contain"
      />

      {/* Touch areas for navigation */}
      <div 
        className="absolute left-0 top-0 bottom-0 w-1/3 cursor-pointer z-10"
        onClick={handlePrevious}
      />
      <div 
        className="absolute right-0 top-0 bottom-0 w-1/3 cursor-pointer z-10"
        onClick={handleNext}
      />

      {/* Footer */}
      <div className="absolute bottom-0 left-0 right-0 p-4 z-20 safe-area-bottom">
        {isOwner ? (
          // Owner sees view count and delete button
          <div className="flex flex-col items-center gap-3">
            <div className="flex items-center gap-2 text-white/80">
              <Eye size={20} />
              <span className="text-sm font-medium">{viewCount} просмотров</span>
              {likesCount > 0 && (
                <>
                  <span className="mx-2">•</span>
                  <Heart size={18} className="fill-red-500 text-red-500" />
                  <span className="text-sm font-medium">{likesCount}</span>
                </>
              )}
            </div>
            <button
              onClick={async () => {
                if (!confirm('Удалить этот сториз?')) return;
                setIsDeleting(true);
                try {
                  const { error } = await supabase
                    .from('stories')
                    .delete()
                    .eq('id', story.id);
                  
                  if (error) throw error;
                  toast.success('Сториз удалён');
                  onStoryDeleted?.();
                  onClose();
                } catch (error) {
                  console.error('Delete story error:', error);
                  toast.error('Ошибка удаления');
                } finally {
                  setIsDeleting(false);
                }
              }}
              disabled={isDeleting}
              className="flex items-center gap-2 px-4 py-2 bg-destructive/20 text-destructive rounded-full text-sm font-medium hover:bg-destructive/30 transition-colors"
            >
              <Trash2 size={16} />
              <span>{isDeleting ? 'Удаление...' : 'Удалить'}</span>
            </button>
          </div>
        ) : (
          // Viewers can like
          <div className="flex justify-center">
            <button
              onClick={handleLike}
              className={`p-4 rounded-full transition-all ${
                hasLiked 
                  ? 'bg-red-500/20 text-red-500' 
                  : 'bg-white/10 text-white hover:bg-white/20'
              }`}
            >
              <Heart 
                size={28} 
                className={hasLiked ? 'fill-red-500' : ''}
              />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
