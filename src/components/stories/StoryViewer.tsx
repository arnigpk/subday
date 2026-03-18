import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '@/integrations/supabase/client';
import { X, Heart, Eye, Trash2, ChevronDown, User } from 'lucide-react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { formatDistanceToNow } from 'date-fns';
import { ru } from 'date-fns/locale';
import { toast } from 'sonner';
import { StoryUser } from '@/hooks/useAllActiveStories';

/* ---- Props ---- */
interface LegacyStory {
  id: string;
  user_id: string;
  image_url: string;
  created_at: string;
  expires_at: string;
  author_name: string;
  author_avatar: string | null;
  media_type?: string;
}

interface LegacyProps {
  stories: LegacyStory[];
  initialIndex: number;
  currentUserId: string | null;
  onClose: () => void;
  onStoryDeleted?: () => void;
}

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

interface ViewerInfo {
  user_id: string;
  name: string;
  avatar_url: string | null;
  viewed_at: string;
}

export function StoryViewer(props: StoryViewerProps) {
  const { currentUserId, onClose, onStoryDeleted } = props;

  const storyUsers: StoryUser[] = isCrossUser(props)
    ? props.storyUsers
    : [{
        userId: props.stories[0]?.user_id || '',
        name: props.stories[0]?.author_name || '',
        avatar: props.stories[0]?.author_avatar || null,
        stories: props.stories.map(s => ({
          id: s.id, user_id: s.user_id, image_url: s.image_url,
          created_at: s.created_at, expires_at: s.expires_at,
          media_type: s.media_type,
        })),
        latestStoryAt: props.stories[props.stories.length - 1]?.created_at || '',
      }];

  const startUserIdx = isCrossUser(props) ? props.startUserIndex : 0;
  
  // Determine start story index: open from the last story (most recent)
  const getStartStoryIndex = () => {
    if (!isCrossUser(props)) return props.initialIndex;
    const user = storyUsers[startUserIdx];
    if (!user) return 0;
    // Start from the last (newest) story
    return user.stories.length - 1;
  };

  const [userIndex, setUserIndex] = useState(startUserIdx);
  const [storyIndex, setStoryIndex] = useState(getStartStoryIndex());
  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState<'entering' | 'open' | 'closing'>('entering');

  const [viewCount, setViewCount] = useState(0);
  const [likesCount, setLikesCount] = useState(0);
  const [hasLiked, setHasLiked] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showViewers, setShowViewers] = useState(false);
  const [viewers, setViewers] = useState<ViewerInfo[]>([]);

  const preloadedImages = useRef<Map<string, HTMLImageElement>>(new Map());
  const timerRef = useRef<ReturnType<typeof setInterval>>();
  const pausedRef = useRef(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Swipe-down state
  const swipeStartY = useRef(0);
  const swipeCurrentY = useRef(0);
  const isSwiping = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const currentUser = storyUsers[userIndex];
  const story = currentUser?.stories[storyIndex];
  const isOwner = currentUserId === story?.user_id;
  const isVideo = story?.media_type === 'video';

  // Preload adjacent story media
  useEffect(() => {
    const toPreload: string[] = [];
    const cu = storyUsers[userIndex];
    if (cu) {
      if (storyIndex + 1 < cu.stories.length) toPreload.push(cu.stories[storyIndex + 1].image_url);
      if (userIndex + 1 < storyUsers.length) toPreload.push(storyUsers[userIndex + 1].stories[storyUsers[userIndex + 1].stories.length - 1].image_url);
    }
    toPreload.forEach(url => {
      if (!preloadedImages.current.has(url)) {
        const img = new window.Image();
        img.src = url;
        preloadedImages.current.set(url, img);
      }
    });
  }, [userIndex, storyIndex, storyUsers]);

  // Phase animation
  useEffect(() => {
    const orig = document.body.style.overflow;
    const origTouchAction = document.body.style.touchAction;
    const origPosition = document.body.style.position;
    const origTop = document.body.style.top;
    const origWidth = document.body.style.width;
    const scrollY = window.scrollY;

    document.body.style.overflow = 'hidden';
    document.body.style.touchAction = 'none';
    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = '100%';

    requestAnimationFrame(() => requestAnimationFrame(() => setPhase('open')));

    return () => {
      document.body.style.overflow = orig;
      document.body.style.touchAction = origTouchAction;
      document.body.style.position = origPosition;
      document.body.style.top = origTop;
      document.body.style.width = origWidth;
      window.scrollTo(0, scrollY);
    };
  }, []);

  const doClose = useCallback(() => {
    setPhase('closing');
    setTimeout(onClose, 300);
  }, [onClose]);

  // Timer — for video, use video duration; for image, 10s
  useEffect(() => {
    if (!story || phase !== 'open') return;
    setProgress(0);

    if (isVideo) {
      // For video, we track progress via timeupdate event
      return;
    }

    const duration = 10000;
    const interval = 50;
    let elapsed = 0;

    timerRef.current = setInterval(() => {
      if (pausedRef.current) return;
      elapsed += interval;
      setProgress((elapsed / duration) * 100);
      if (elapsed >= duration) goNext();
    }, interval);

    return () => clearInterval(timerRef.current);
  }, [userIndex, storyIndex, story?.id, phase, isVideo]);

  // Video progress tracking
  useEffect(() => {
    if (!isVideo || !videoRef.current) return;
    const video = videoRef.current;
    
    const onTimeUpdate = () => {
      if (video.duration) {
        setProgress((video.currentTime / video.duration) * 100);
      }
    };
    const onEnded = () => { goNext(); };
    
    video.addEventListener('timeupdate', onTimeUpdate);
    video.addEventListener('ended', onEnded);
    
    return () => {
      video.removeEventListener('timeupdate', onTimeUpdate);
      video.removeEventListener('ended', onEnded);
    };
  }, [isVideo, story?.id, userIndex, storyIndex]);

  // Record view + fetch stats
  useEffect(() => {
    if (!story) return;
    if (currentUserId && !isOwner) recordView();
    fetchStats();
    setShowViewers(false);
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
        .from('story_likes').select('id')
        .eq('story_id', story.id).eq('user_id', currentUserId).maybeSingle();
      setHasLiked(!!data);
    }
  };

  const fetchViewers = async () => {
    if (!story) return;
    const { data: viewsData } = await supabase
      .from('story_views')
      .select('user_id, created_at')
      .eq('story_id', story.id)
      .order('created_at', { ascending: false })
      .limit(100);
    if (!viewsData || viewsData.length === 0) { setViewers([]); return; }

    const userIds = viewsData.map(v => v.user_id);
    const { data: profiles } = await supabase
      .from('profiles')
      .select('user_id, name, avatar_url, subflow_nickname')
      .in('user_id', userIds);
    const profileMap = new Map((profiles || []).map(p => [p.user_id, p]));

    setViewers(viewsData.map(v => {
      const p = profileMap.get(v.user_id);
      return {
        user_id: v.user_id,
        name: p?.subflow_nickname || p?.name || 'Пользователь',
        avatar_url: p?.avatar_url || null,
        viewed_at: v.created_at,
      };
    }));
  };

  const toggleViewers = () => {
    if (!showViewers) {
      fetchViewers();
      pausedRef.current = true;
      if (isVideo && videoRef.current) videoRef.current.pause();
    } else {
      pausedRef.current = false;
      if (isVideo && videoRef.current) videoRef.current.play();
    }
    setShowViewers(!showViewers);
  };

  const goNext = useCallback(() => {
    clearInterval(timerRef.current);
    const cu = storyUsers[userIndex];
    if (storyIndex < cu.stories.length - 1) {
      setStoryIndex(prev => prev + 1);
    } else if (userIndex < storyUsers.length - 1) {
      setUserIndex(prev => prev + 1);
      // Open from the last (newest) story of next user
      const nextUser = storyUsers[userIndex + 1];
      setStoryIndex(nextUser ? nextUser.stories.length - 1 : 0);
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
      try {
        await supabase.from('subflow_notifications').insert({
          user_id: story.user_id,
          actor_id: currentUserId,
          type: 'story_like',
          post_id: null,
          reaction: '❤️',
        });
      } catch {}
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
      currentUser.stories.splice(storyIndex, 1);
      if (currentUser.stories.length === 0) {
        if (storyUsers.length <= 1) { doClose(); return; }
        storyUsers.splice(userIndex, 1);
        if (userIndex >= storyUsers.length) setUserIndex(storyUsers.length - 1);
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

  const handlePointerDown = () => {
    pausedRef.current = true;
    if (isVideo && videoRef.current) videoRef.current.pause();
  };
  const handlePointerUp = () => {
    if (!showViewers) {
      pausedRef.current = false;
      if (isVideo && videoRef.current) videoRef.current.play();
    }
  };

  const handleSwipeTouchStart = (e: React.TouchEvent) => {
    swipeStartY.current = e.touches[0].clientY;
    swipeCurrentY.current = 0;
    isSwiping.current = false;
  };

  const handleSwipeTouchMove = (e: React.TouchEvent) => {
    const dy = e.touches[0].clientY - swipeStartY.current;
    if (dy > 10) isSwiping.current = true;
    swipeCurrentY.current = Math.max(0, dy);
    if (containerRef.current && isSwiping.current) {
      containerRef.current.style.transform = `translateY(${swipeCurrentY.current * 0.5}px) scale(${1 - swipeCurrentY.current * 0.0005})`;
      containerRef.current.style.transition = 'none';
    }
  };

  const handleSwipeTouchEnd = () => {
    if (containerRef.current) {
      if (swipeCurrentY.current > 120) {
        doClose();
      } else {
        containerRef.current.style.transition = 'transform 0.3s ease';
        containerRef.current.style.transform = 'translateY(0) scale(1)';
      }
    }
    isSwiping.current = false;
  };

  if (!story || !currentUser) return null;

  const opacity = phase === 'entering' ? 0 : phase === 'closing' ? 0 : 1;

  const viewer = (
    <div
      className="fixed inset-0 flex items-center justify-center overflow-hidden select-none"
      style={{ zIndex: 99999, opacity, transition: 'opacity 0.3s ease', backgroundColor: '#000', touchAction: 'none' }}
      onTouchStart={handleSwipeTouchStart}
      onTouchMove={(e) => { e.preventDefault(); handleSwipeTouchMove(e); }}
      onTouchEnd={handleSwipeTouchEnd}
    >
      <div ref={containerRef} className="absolute inset-0">
        {/* Blurred bg */}
        {!isVideo && (
          <div
            className="absolute inset-0 bg-cover bg-center scale-110"
            style={{ backgroundImage: `url(${story.image_url})`, filter: 'blur(40px) brightness(0.4)' }}
          />
        )}
        <div className="absolute inset-0 bg-black/30" />

        {/* Progress bars */}
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
              {currentUser.avatar ? <AvatarImage src={currentUser.avatar} alt={currentUser.name} className="object-cover" /> : null}
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

        {/* Swipe indicator */}
        <div className="absolute top-14 left-1/2 -translate-x-1/2 z-20 safe-area-top">
          <ChevronDown size={18} className="text-white/40 animate-bounce" />
        </div>

        {/* Media */}
        {isVideo ? (
          <video
            ref={videoRef}
            src={story.image_url}
            className="relative z-10 w-full h-full object-contain"
            autoPlay
            playsInline
            muted={false}
          />
        ) : (
          <img src={story.image_url} alt="Story" className="relative z-10 w-full h-full object-contain" />
        )}

        {/* Touch navigation zones */}
        <div className="absolute left-0 top-0 bottom-0 w-1/3 z-10"
          onClick={() => { if (!isSwiping.current) goPrev(); }}
          onPointerDown={handlePointerDown} onPointerUp={handlePointerUp}
        />
        <div className="absolute right-0 top-0 bottom-0 w-1/3 z-10"
          onClick={() => { if (!isSwiping.current) goNext(); }}
          onPointerDown={handlePointerDown} onPointerUp={handlePointerUp}
        />
        <div className="absolute left-1/3 right-1/3 top-0 bottom-0 z-10"
          onPointerDown={handlePointerDown} onPointerUp={handlePointerUp}
        />

        {/* Footer */}
        <div className="absolute bottom-0 left-0 right-0 z-20 safe-area-bottom">
          {isOwner && showViewers && (
            <div className="mx-4 mb-2 bg-black/70 backdrop-blur-xl rounded-2xl max-h-60 overflow-y-auto">
              <div className="px-4 py-3 border-b border-white/10">
                <p className="text-white text-sm font-semibold">{viewCount} просмотров</p>
              </div>
              {viewers.length === 0 ? (
                <p className="text-white/50 text-sm text-center py-4">Пока никто не посмотрел</p>
              ) : (
                <div className="divide-y divide-white/5">
                  {viewers.map(v => (
                    <div key={v.user_id} className="flex items-center gap-3 px-4 py-2.5">
                      <Avatar className="w-8 h-8">
                        {v.avatar_url ? <AvatarImage src={v.avatar_url} /> : null}
                        <AvatarFallback className="bg-white/10 text-white text-xs">
                          <User size={14} />
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-white text-sm flex-1 truncate">{v.name}</span>
                      <span className="text-white/40 text-xs">
                        {formatDistanceToNow(new Date(v.viewed_at), { addSuffix: true, locale: ru })}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="p-4">
            {isOwner ? (
              <div className="flex flex-col items-center gap-3">
                <button onClick={toggleViewers} className="flex items-center gap-2 text-white/80">
                  <Eye size={20} />
                  <span className="text-sm font-medium">{viewCount} просмотров</span>
                  {likesCount > 0 && (
                    <>
                      <span className="mx-2">•</span>
                      <Heart size={18} className="fill-red-500 text-red-500" />
                      <span className="text-sm font-medium">{likesCount}</span>
                    </>
                  )}
                </button>
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
      </div>
    </div>
  );

  return createPortal(viewer, document.body);
}
