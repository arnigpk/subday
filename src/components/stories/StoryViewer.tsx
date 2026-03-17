import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '@/integrations/supabase/client';
import { X, Heart, Eye, Trash2 } from 'lucide-react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { User } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ru } from 'date-fns/locale';
import { toast } from 'sonner';
import { StoryUser } from '@/hooks/useAllActiveStories';

/* ---- Legacy single-user props (backward compat) ---- */
interface LegacyStory {
  id: string;
  user_id: string;
  image_url: string;
  created_at: string;
  expires_at: string;
  author_name: string;
  author_avatar: string | null;
}

interface LegacyProps {
  stories: LegacyStory[];
  initialIndex: number;
  currentUserId: string | null;
  onClose: () => void;
  onStoryDeleted?: () => void;
}

/* ---- New cross-user props ---- */
interface CrossUserProps {
  storyUsers: StoryUser[];
  startUserIndex: number;
  currentUserId: string | null;
  onClose: () => void;
  onStoryDeleted?: () => void;
}

type StoryViewerProps = LegacyProps | CrossUserProps;

function isCrossUser(props: StoryViewerProps): props is CrossUserProps {
  return 'storyUsers' in props;
}

export function StoryViewer(props: StoryViewerProps) {
  const { currentUserId, onClose, onStoryDeleted } = props;

  // Normalize into storyUsers array
  const storyUsers: StoryUser[] = isCrossUser(props)
    ? props.storyUsers
    : [{
        userId: props.stories[0]?.user_id || '',
        name: props.stories[0]?.author_name || '',
        avatar: props.stories[0]?.author_avatar || null,
        stories: props.stories.map(s => ({
          id: s.id,
          user_id: s.user_id,
          image_url: s.image_url,
          created_at: s.created_at,
          expires_at: s.expires_at,
        })),
      }];

  const startUserIdx = isCrossUser(props) ? props.startUserIndex : 0;
  const startStoryIdx = isCrossUser(props) ? 0 : props.initialIndex;

  const [userIndex, setUserIndex] = useState(startUserIdx);
  const [storyIndex, setStoryIndex] = useState(startStoryIdx);
  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState<'entering' | 'open' | 'closing'>('entering');

  const [viewCount, setViewCount] = useState(0);
  const [likesCount, setLikesCount] = useState(0);
  const [hasLiked, setHasLiked] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const timerRef = useRef<ReturnType<typeof setInterval>>();
  const pausedRef = useRef(false);

  const currentUser = storyUsers[userIndex];
  const story = currentUser?.stories[storyIndex];
  const isOwner = currentUserId === story?.user_id;

  // Phase animation
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    requestAnimationFrame(() => requestAnimationFrame(() => setPhase('open')));
    return () => { document.body.style.overflow = ''; };
  }, []);

  const doClose = useCallback(() => {
    setPhase('closing');
    setTimeout(onClose, 300);
  }, [onClose]);

  // Timer
  useEffect(() => {
    if (!story || phase !== 'open') return;
    setProgress(0);
    const duration = 10000;
    const interval = 50;
    let elapsed = 0;

    timerRef.current = setInterval(() => {
      if (pausedRef.current) return;
      elapsed += interval;
      setProgress((elapsed / duration) * 100);
      if (elapsed >= duration) {
        goNext();
      }
    }, interval);

    return () => clearInterval(timerRef.current);
  }, [userIndex, storyIndex, story?.id, phase]);

  // Record view + fetch stats
  useEffect(() => {
    if (!story) return;
    if (currentUserId && !isOwner) recordView();
    fetchStats();
  }, [story?.id]);

  const recordView = async () => {
    if (!story || !currentUserId) return;
    try {
      await supabase.from('story_views').upsert(
        { story_id: story.id, user_id: currentUserId },
        { onConflict: 'story_id,user_id' }
      );
    } catch {}
  };

  const fetchStats = async () => {
    if (!story) return;
    const [{ count: views }, { count: likes }] = await Promise.all([
      supabase.from('story_views').select('*', { count: 'exact', head: true }).eq('story_id', story.id),
      supabase.from('story_likes').select('*', { count: 'exact', head: true }).eq('story_id', story.id),
    ]);
    setViewCount(views || 0);
    setLikesCount(likes || 0);

    if (currentUserId) {
      const { data } = await supabase
        .from('story_likes')
        .select('id')
        .eq('story_id', story.id)
        .eq('user_id', currentUserId)
        .maybeSingle();
      setHasLiked(!!data);
    }
  };

  const goNext = useCallback(() => {
    clearInterval(timerRef.current);
    const cu = storyUsers[userIndex];
    if (storyIndex < cu.stories.length - 1) {
      setStoryIndex(prev => prev + 1);
    } else if (userIndex < storyUsers.length - 1) {
      setUserIndex(prev => prev + 1);
      setStoryIndex(0);
    } else {
      doClose();
    }
  }, [userIndex, storyIndex, storyUsers, doClose]);

  const goPrev = useCallback(() => {
    clearInterval(timerRef.current);
    if (storyIndex > 0) {
      setStoryIndex(prev => prev - 1);
    } else if (userIndex > 0) {
      const prevUser = storyUsers[userIndex - 1];
      setUserIndex(prev => prev - 1);
      setStoryIndex(prevUser.stories.length - 1);
    }
  }, [userIndex, storyIndex, storyUsers]);

  const handleLike = async () => {
    if (!story || !currentUserId || isOwner) return;
    if (hasLiked) {
      await supabase.from('story_likes').delete().eq('story_id', story.id).eq('user_id', currentUserId);
      setHasLiked(false);
      setLikesCount(prev => prev - 1);
    } else {
      await supabase.from('story_likes').insert({ story_id: story.id, user_id: currentUserId });
      setHasLiked(true);
      setLikesCount(prev => prev + 1);
    }
  };

  const handleDelete = async () => {
    if (!story || !confirm('Удалить этот сториз?')) return;
    setIsDeleting(true);
    try {
      const { error } = await supabase.from('stories').delete().eq('id', story.id);
      if (error) throw error;
      toast.success('Сториз удалён');
      onStoryDeleted?.();
      // Remove from local state and navigate
      currentUser.stories.splice(storyIndex, 1);
      if (currentUser.stories.length === 0) {
        if (storyUsers.length <= 1) { doClose(); return; }
        storyUsers.splice(userIndex, 1);
        if (userIndex >= storyUsers.length) {
          setUserIndex(storyUsers.length - 1);
        }
        setStoryIndex(0);
      } else if (storyIndex >= currentUser.stories.length) {
        setStoryIndex(currentUser.stories.length - 1);
      }
    } catch {
      toast.error('Ошибка удаления');
    } finally {
      setIsDeleting(false);
    }
  };

  // Touch handling for pause/resume
  const handlePointerDown = () => { pausedRef.current = true; };
  const handlePointerUp = () => { pausedRef.current = false; };

  if (!story || !currentUser) return null;

  const opacity = phase === 'entering' ? 0 : phase === 'closing' ? 0 : 1;

  const viewer = (
    <div
      className="fixed inset-0 flex items-center justify-center overflow-hidden select-none"
      style={{
        zIndex: 99999,
        opacity,
        transition: 'opacity 0.3s ease',
      }}
    >
      {/* Blurred bg */}
      <div
        className="absolute inset-0 bg-cover bg-center scale-110"
        style={{ backgroundImage: `url(${story.image_url})`, filter: 'blur(40px) brightness(0.4)' }}
      />
      <div className="absolute inset-0 bg-black/30" />

      {/* Progress bars for current user */}
      <div className="absolute top-0 left-0 right-0 flex gap-1 p-2 z-20 safe-area-top">
        {currentUser.stories.map((_, idx) => (
          <div key={idx} className="flex-1 h-1 bg-white/30 rounded-full overflow-hidden">
            <div
              className="h-full bg-white rounded-full"
              style={{
                width: idx < storyIndex ? '100%' : idx === storyIndex ? `${progress}%` : '0%',
                transition: idx === storyIndex ? 'none' : 'width 0.2s',
              }}
            />
          </div>
        ))}
      </div>

      {/* Header */}
      <div className="absolute top-6 left-0 right-0 flex items-center justify-between px-4 z-20 safe-area-top">
        <div className="flex items-center gap-3">
          <Avatar className="w-10 h-10 ring-2 ring-white/50">
            {currentUser.avatar ? <AvatarImage src={currentUser.avatar} alt={currentUser.name} /> : null}
            <AvatarFallback className="bg-white/20"><User size={16} className="text-white" /></AvatarFallback>
          </Avatar>
          <div>
            <p className="text-white font-medium text-sm drop-shadow-md">{currentUser.name}</p>
            <p className="text-white/80 text-xs drop-shadow-md">
              {formatDistanceToNow(new Date(story.created_at), { addSuffix: true, locale: ru })}
            </p>
          </div>
        </div>
        <button onClick={doClose} className="p-2 text-white/80 hover:text-white drop-shadow-md z-30">
          <X size={24} />
        </button>
      </div>

      {/* Image */}
      <img src={story.image_url} alt="Story" className="relative z-10 w-full h-full object-contain" />

      {/* Touch navigation zones */}
      <div
        className="absolute left-0 top-0 bottom-0 w-1/3 z-10"
        onClick={goPrev}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
      />
      <div
        className="absolute right-0 top-0 bottom-0 w-1/3 z-10"
        onClick={goNext}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
      />
      {/* Center zone for pause only */}
      <div
        className="absolute left-1/3 right-1/3 top-0 bottom-0 z-10"
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
      />

      {/* Footer */}
      <div className="absolute bottom-0 left-0 right-0 p-4 z-20 safe-area-bottom">
        {isOwner ? (
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
              onClick={handleDelete}
              disabled={isDeleting}
              className="flex items-center gap-2 px-4 py-2 bg-destructive/20 text-destructive rounded-full text-sm font-medium hover:bg-destructive/30 transition-colors"
            >
              <Trash2 size={16} />
              <span>{isDeleting ? 'Удаление...' : 'Удалить'}</span>
            </button>
          </div>
        ) : (
          <div className="flex justify-center">
            <button
              onClick={handleLike}
              className={`p-4 rounded-full transition-all ${
                hasLiked ? 'bg-red-500/20 text-red-500' : 'bg-white/10 text-white hover:bg-white/20'
              }`}
            >
              <Heart size={28} className={hasLiked ? 'fill-red-500' : ''} />
            </button>
          </div>
        )}
      </div>
    </div>
  );

  return createPortal(viewer, document.body);
}
