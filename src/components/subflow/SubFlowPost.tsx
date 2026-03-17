import { useState, useMemo, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { MessageCircle, Trash2, MapPin, ChevronLeft, ChevronRight, Pencil, X, Check, User, UserPlus, UserCheck, Maximize2, Plus } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { format, parseISO, differenceInMinutes } from 'date-fns';
import { ru } from 'date-fns/locale';
import { SubFlowComments } from './SubFlowComments';
import { SubFlowImageViewer } from './SubFlowImageViewer';
import { SubFlowVideoPlayer } from './SubFlowVideoPlayer';
import { isVideoUrl } from '@/utils/imageCompression';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { toast } from 'sonner';
import { useLanguage } from '@/contexts/LanguageContext';
import { useVibration } from '@/hooks/useVibration';
import { useSubFlowFollow } from '@/hooks/useSubFlowFollow';

interface Post {
  id: string;
  user_id: string;
  content: string;
  image_url: string | null;
  image_urls?: string[];
  shop_id: string | null;
  shop_name: string | null;
  created_at: string;
  author_name: string;
  author_avatar: string | null;
  reactions: Record<string, number>;
  user_reactions: string[];
  comments_count: number;
}

interface SubFlowPostProps {
  post: Post;
  currentUserId: string | null;
  onUpdate: () => void;
  animationDelay: number;
  hasActiveSubscription: boolean;
  isHighlighted?: boolean;
  onHighlightDone?: () => void;
}

const PRIMARY_REACTIONS = ['💚', '👍', '🔥', '🚀', '⚡️'];
const EXTRA_REACTIONS = ['😂', '😍', '🥳', '🤔', '😢', '👏', '💯', '🎉', '❤️', '😎'];
const ALL_REACTIONS = [...PRIMARY_REACTIONS, ...EXTRA_REACTIONS];
const MAX_REACTIONS_PER_USER = 2;

export function SubFlowPost({ post, currentUserId, onUpdate, animationDelay, hasActiveSubscription, isHighlighted, onHighlightDone }: SubFlowPostProps) {
  const [showComments, setShowComments] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(post.content);
  const [isSaving, setIsSaving] = useState(false);
  const [localReactions, setLocalReactions] = useState(post.reactions);
  const [localUserReactions, setLocalUserReactions] = useState(post.user_reactions);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [commentsCount, setCommentsCount] = useState(post.comments_count);
  const [imageLoaded, setImageLoaded] = useState<Record<number, boolean>>({});
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxRect, setLightboxRect] = useState<{ top: number; left: number; width: number; height: number } | null>(null);
  const postImgRef = useRef<HTMLImageElement>(null);
    const [showImageHint, setShowImageHint] = useState(false);
    const MAX_HINT_SHOWS = 3;
  const [isAdmin, setIsAdmin] = useState(false);
  const { t } = useLanguage();
  const { vibrateShort } = useVibration();
  const { isFollowing, isLoading: isFollowLoading, toggleFollow } = useSubFlowFollow(currentUserId, post.user_id);
  const postRef = useRef<HTMLDivElement>(null);

  // Scroll into view and highlight
  useEffect(() => {
    if (isHighlighted && postRef.current) {
      postRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const timer = setTimeout(() => onHighlightDone?.(), 2000);
      return () => clearTimeout(timer);
    }
  }, [isHighlighted]);

  // Check if current user is admin
  useEffect(() => {
    if (!currentUserId) {
      setIsAdmin(false);
      return;
    }
    
    supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', currentUserId)
      .eq('role', 'admin')
      .maybeSingle()
      .then(({ data }) => {
        setIsAdmin(!!data);
      });
  }, [currentUserId]);
  
  // Swipe handling
  const touchStartX = useRef<number | null>(null);
  const touchEndX = useRef<number | null>(null);
  const minSwipeDistance = 50;
  
  // Track processed reaction IDs to prevent duplicates
  const [processedReactionIds] = useState(() => new Set<string>());
  // Track pending optimistic updates to skip real-time events
  const [pendingReactions] = useState(() => new Set<string>());

  // Sync with props when they change
  useEffect(() => {
    setLocalReactions(post.reactions);
    setLocalUserReactions(post.user_reactions);
  }, [post.reactions, post.user_reactions]);

  // Real-time subscription for reactions on this post
  useEffect(() => {
    const channel = supabase
      .channel(`reactions-${post.id}`)
      .on('postgres_changes', { 
        event: 'INSERT', 
        schema: 'public', 
        table: 'subflow_reactions',
        filter: `post_id=eq.${post.id}`
      }, (payload) => {
        const newReaction = payload.new as any;
        const reactionKey = `${newReaction.user_id}-${newReaction.reaction}`;
        
        // Skip if already processed or if it's our own pending optimistic update
        if (processedReactionIds.has(newReaction.id)) return;
        processedReactionIds.add(newReaction.id);
        
        // Skip real-time update for our own reactions (already handled optimistically)
        if (newReaction.user_id === currentUserId && pendingReactions.has(reactionKey)) {
          pendingReactions.delete(reactionKey);
          return;
        }
        
        setLocalReactions(prev => ({
          ...prev,
          [newReaction.reaction]: (prev[newReaction.reaction] || 0) + 1
        }));
        // Update user reactions if it's current user
        if (newReaction.user_id === currentUserId) {
          setLocalUserReactions(prev => {
            if (prev.includes(newReaction.reaction)) return prev;
            return [...prev, newReaction.reaction];
          });
        }
      })
      .on('postgres_changes', { 
        event: 'DELETE', 
        schema: 'public', 
        table: 'subflow_reactions',
        filter: `post_id=eq.${post.id}`
      }, (payload) => {
        const deletedReaction = payload.old as any;
        const reactionKey = `${deletedReaction.user_id}-${deletedReaction.reaction}`;
        
        // Skip if it's our own pending optimistic delete
        if (deletedReaction.user_id === currentUserId && pendingReactions.has(`del-${reactionKey}`)) {
          pendingReactions.delete(`del-${reactionKey}`);
          return;
        }
        
        setLocalReactions(prev => ({
          ...prev,
          [deletedReaction.reaction]: Math.max(0, (prev[deletedReaction.reaction] || 1) - 1)
        }));
        // Update user reactions if it's current user
        if (deletedReaction.user_id === currentUserId) {
          setLocalUserReactions(prev => prev.filter(r => r !== deletedReaction.reaction));
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [post.id, currentUserId, processedReactionIds, pendingReactions]);

  // Real-time subscription for comments count
  useEffect(() => {
    const channel = supabase
      .channel(`comments-count-${post.id}`)
      .on('postgres_changes', { 
        event: 'INSERT', 
        schema: 'public', 
        table: 'subflow_comments',
        filter: `post_id=eq.${post.id}`
      }, () => {
        setCommentsCount(prev => prev + 1);
      })
      .on('postgres_changes', { 
        event: 'DELETE', 
        schema: 'public', 
        table: 'subflow_comments',
        filter: `post_id=eq.${post.id}`
      }, () => {
        setCommentsCount(prev => Math.max(0, prev - 1));
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [post.id]);

  const isOwner = currentUserId === post.user_id;
  const canDelete = isOwner || isAdmin;
  
  // Check if post can be edited (within 1 hour of creation)
  const canEdit = useMemo(() => {
    if (!isOwner) return false;
    const createdAt = parseISO(post.created_at);
    const minutesSinceCreation = differenceInMinutes(new Date(), createdAt);
    return minutesSinceCreation <= 60;
  }, [isOwner, post.created_at]);
  
  // Get all images - prefer image_urls array, fallback to single image_url
  const images = post.image_urls?.length ? post.image_urls : (post.image_url ? [post.image_url] : []);

  // Preload all images when post mounts
  useEffect(() => {
    if (images.length <= 1) return;
    
    images.forEach((src, index) => {
      const img = new window.Image();
      img.src = src;
      img.onload = () => {
        setImageLoaded(prev => ({ ...prev, [index]: true }));
      };
    });
  }, [images]);

  const formatDate = (dateStr: string) => {
    try {
      const date = parseISO(dateStr);
      return format(date, 'd MMM в HH:mm', { locale: ru });
    } catch {
      return dateStr;
    }
  };

  const handleReaction = async (reaction: string) => {
    if (!currentUserId) {
      toast.error(t('subflow.loginToReact'));
      return;
    }

    vibrateShort();

    const hasReaction = localUserReactions.includes(reaction);
    const reactionKey = `${currentUserId}-${reaction}`;
    
    // Check if user already has max reactions and trying to add new one
    if (!hasReaction && localUserReactions.length >= MAX_REACTIONS_PER_USER) {
      toast.error(`Максимум ${MAX_REACTIONS_PER_USER} реакции на пост`);
      return;
    }

    // Mark as pending to skip real-time duplicate
    if (hasReaction) {
      pendingReactions.add(`del-${reactionKey}`);
    } else {
      pendingReactions.add(reactionKey);
    }

    // Optimistic update
    if (hasReaction) {
      setLocalUserReactions(prev => prev.filter(r => r !== reaction));
      setLocalReactions(prev => ({
        ...prev,
        [reaction]: Math.max(0, (prev[reaction] || 1) - 1)
      }));
    } else {
      setLocalUserReactions(prev => [...prev, reaction]);
      setLocalReactions(prev => ({
        ...prev,
        [reaction]: (prev[reaction] || 0) + 1
      }));
    }

    try {
      if (hasReaction) {
        await supabase
          .from('subflow_reactions')
          .delete()
          .eq('post_id', post.id)
          .eq('user_id', currentUserId)
          .eq('reaction', reaction);
      } else {
        const { error } = await supabase
          .from('subflow_reactions')
          .upsert({
            post_id: post.id,
            user_id: currentUserId,
            reaction
          }, { onConflict: 'user_id,post_id,reaction' });

        if (error) {
          // DB trigger rejected — revert optimistic update
          console.error('Reaction insert rejected:', error.message);
          pendingReactions.delete(reactionKey);
          onUpdate();
          return;
        }

        // Fire-and-forget notification for new reaction (not removal)
        supabase.functions.invoke('subflow-notify', {
          body: { type: 'reaction', postId: post.id, actorId: currentUserId, reaction }
        }).catch(() => {});
      }
    } catch (error) {
      console.error('Reaction error:', error);
      // Clear pending and revert on error
      pendingReactions.delete(reactionKey);
      pendingReactions.delete(`del-${reactionKey}`);
      onUpdate();
    }
  };

  const handleDelete = async () => {
    if (!confirm(t('subflow.confirmDelete'))) return;
    
    setIsDeleting(true);
    try {
      const { error } = await supabase
        .from('subflow_posts')
        .delete()
        .eq('id', post.id);

      if (error) throw error;
      toast.success(t('subflow.deleted'));
      onUpdate();
    } catch (error) {
      console.error('Delete error:', error);
      toast.error(t('subflow.deleteError'));
    } finally {
      setIsDeleting(false);
    }
  };

  const handleSaveEdit = async () => {
    if (!editContent.trim()) {
      toast.error(t('subflow.writeText'));
      return;
    }

    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('subflow_posts')
        .update({ content: editContent.trim() })
        .eq('id', post.id);

      if (error) throw error;
      toast.success(t('subflow.updated'));
      setIsEditing(false);
      onUpdate();
    } catch (error) {
      console.error('Edit error:', error);
      toast.error(t('subflow.saveError'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancelEdit = () => {
    setEditContent(post.content);
    setIsEditing(false);
  };

  return (
    <div 
      ref={postRef}
      className={`card-static animate-slide-up transition-shadow duration-500 ${isHighlighted ? 'ring-2 ring-primary/50 shadow-[0_0_16px_hsl(var(--primary)/0.2)]' : ''}`}
      style={{ animationDelay: `${animationDelay}s` }}
    >
      {/* Header */}
      <div className="flex items-center gap-3 mb-3">
        <Avatar className="w-11 h-11">
          {post.author_avatar ? (
            <AvatarImage src={post.author_avatar} alt={post.author_name} className="object-cover" />
          ) : null}
          <AvatarFallback className="bg-primary/10">
            <User size={20} className="text-primary" />
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-bold text-foreground truncate">{post.author_name}</p>
            {currentUserId && currentUserId !== post.user_id && (
              <button
                onClick={toggleFollow}
                disabled={isFollowLoading}
                className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium transition-all ${
                  isFollowing
                    ? 'bg-primary/10 text-primary'
                    : 'bg-secondary text-muted-foreground hover:text-foreground'
                }`}
              >
                {isFollowing ? <UserCheck size={12} /> : <UserPlus size={12} />}
                {isFollowing ? 'Подписан' : 'Подписаться'}
              </button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">{formatDate(post.created_at)}</p>
        </div>
        <div className="flex items-center gap-1">
          {isOwner && canEdit && !isEditing && (
            <button
              onClick={() => setIsEditing(true)}
              className="p-2 rounded-full text-muted-foreground hover:text-primary hover:bg-primary/10 transition-all"
              title="Редактировать (доступно 1 час)"
            >
              <Pencil size={16} />
            </button>
          )}
          {canDelete && (
            <button
              onClick={handleDelete}
              disabled={isDeleting}
              className="p-2 rounded-full text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all"
              title={isAdmin && !isOwner ? "Удалить как админ" : "Удалить"}
            >
              <Trash2 size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Shop tag */}
      {post.shop_name && (
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-primary/10 text-primary rounded-full text-xs font-medium mb-3">
          <MapPin size={12} />
          <span>{post.shop_name}</span>
        </div>
      )}

      {/* Content */}
      {isEditing ? (
        <div className="mb-3">
          <textarea
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            rows={3}
            className="w-full px-3 py-2 bg-secondary border border-border rounded-xl text-foreground resize-none focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
          <div className="flex items-center gap-2 mt-2">
            <button
              onClick={handleSaveEdit}
              disabled={isSaving}
              className="flex items-center gap-1 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium"
            >
              <Check size={14} />
              <span>{isSaving ? t('subflow.saving') : t('subflow.save')}</span>
            </button>
            <button
              onClick={handleCancelEdit}
              className="flex items-center gap-1 px-3 py-1.5 bg-secondary text-foreground rounded-lg text-sm font-medium"
            >
              <X size={14} />
              <span>{t('subflow.cancel')}</span>
            </button>
          </div>
        </div>
      ) : (
        <p className="text-foreground leading-relaxed mb-3 whitespace-pre-wrap">{post.content}</p>
      )}

      {/* Media carousel with swipe support and progressive loading */}
      {images.length > 0 && (
        <div 
          className="mb-4 -mx-4 overflow-hidden relative touch-pan-y"
          onTouchStart={(e) => {
            touchStartX.current = e.touches[0].clientX;
            touchEndX.current = null;
          }}
          onTouchMove={(e) => {
            touchEndX.current = e.touches[0].clientX;
          }}
          onTouchEnd={() => {
            if (!touchStartX.current || !touchEndX.current) return;
            
            const distance = touchStartX.current - touchEndX.current;
            const isSwipeLeft = distance > minSwipeDistance;
            const isSwipeRight = distance < -minSwipeDistance;
            
            if (isSwipeLeft && currentImageIndex < images.length - 1) {
              setCurrentImageIndex(prev => prev + 1);
            } else if (isSwipeRight && currentImageIndex > 0) {
              setCurrentImageIndex(prev => prev - 1);
            }
            
            touchStartX.current = null;
            touchEndX.current = null;
          }}
        >
          {isVideoUrl(images[currentImageIndex]) ? (
            /* Video player */
            <SubFlowVideoPlayer src={images[currentImageIndex]} />
          ) : (
            <>
              {/* Blur placeholder while loading */}
              {!imageLoaded[currentImageIndex] && (
                <div className="absolute inset-0 bg-muted animate-pulse" />
              )}
              <img
                ref={postImgRef}
                src={images[currentImageIndex]}
                alt={`Post image ${currentImageIndex + 1}`}
                className={`w-full max-h-[28rem] object-contain select-none transition-opacity duration-300 bg-black/5 dark:bg-white/5 rounded-sm ${
                  imageLoaded[currentImageIndex] ? 'opacity-100' : 'opacity-0'
                }`}
                loading="lazy"
                draggable={false}
                onClick={() => {
                  if (postImgRef.current) {
                    const rect = postImgRef.current.getBoundingClientRect();
                    setLightboxRect({ top: rect.top, left: rect.left, width: rect.width, height: rect.height });
                  }
                  setLightboxOpen(true);
                  const cnt = parseInt(localStorage.getItem('subflow_image_hint_count') || '0', 10);
                  if (cnt < MAX_HINT_SHOWS) {
                    localStorage.setItem('subflow_image_hint_count', String(cnt + 1));
                  }
                  setShowImageHint(false);
                }}
                onLoad={() => {
                  setImageLoaded(prev => ({ ...prev, [currentImageIndex]: true }));
                  const hintCount = parseInt(localStorage.getItem('subflow_image_hint_count') || '0', 10);
                  if (hintCount < MAX_HINT_SHOWS) {
                    setShowImageHint(true);
                  }
                }}
              />
              {/* Maximize icon overlay */}
              <button
                onClick={() => {
                  if (postImgRef.current) {
                    const rect = postImgRef.current.getBoundingClientRect();
                    setLightboxRect({ top: rect.top, left: rect.left, width: rect.width, height: rect.height });
                  }
                  setLightboxOpen(true);
                  const count = parseInt(localStorage.getItem('subflow_image_hint_count') || '0', 10);
                  if (count < MAX_HINT_SHOWS) {
                    localStorage.setItem('subflow_image_hint_count', String(count + 1));
                  }
                  setShowImageHint(false);
                }}
                className={`absolute bottom-2 right-2 p-1.5 rounded-full bg-black/30 backdrop-blur-sm text-white/80 transition-all hover:bg-black/50 active:scale-90 ${showImageHint ? 'animate-pulse' : ''}`}
              >
                <Maximize2 size={14} />
              </button>
              {/* One-time tooltip hint */}
              {showImageHint && (
                <div
                  onClick={() => setShowImageHint(false)}
                  className="absolute bottom-10 right-2 px-3 py-1.5 rounded-lg bg-black/70 backdrop-blur-sm text-white text-xs font-medium whitespace-nowrap animate-fade-in cursor-pointer"
                >
                  {t('subflow.tapToEnlarge')}
                  <div className="absolute -bottom-1 right-4 w-2 h-2 bg-black/70 rotate-45" />
                </div>
              )}
            </>
          )}
          {images.length > 1 && (
            <>
              {/* Navigation arrows */}
              {currentImageIndex > 0 && (
                <button
                  onClick={() => setCurrentImageIndex(prev => prev - 1)}
                  className="absolute left-2 top-1/2 -translate-y-1/2 p-1.5 bg-background/80 rounded-full text-foreground hover:bg-background transition-colors"
                >
                  <ChevronLeft size={20} />
                </button>
              )}
              {currentImageIndex < images.length - 1 && (
                <button
                  onClick={() => setCurrentImageIndex(prev => prev + 1)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 bg-background/80 rounded-full text-foreground hover:bg-background transition-colors"
                >
                  <ChevronRight size={20} />
                </button>
              )}
              {/* Dots indicator */}
              <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5">
                {images.map((_, index) => (
                  <button
                    key={index}
                    onClick={() => setCurrentImageIndex(index)}
                    className={`w-2 h-2 rounded-full transition-all ${
                      index === currentImageIndex 
                        ? 'bg-primary w-4' 
                        : 'bg-background/60'
                    }`}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Reactions */}
      {(() => {
        // Collect all reactions that have counts or are primary
        const activeExtraReactions = EXTRA_REACTIONS.filter(r => (localReactions[r] || 0) > 0);
        const visibleReactions = [...PRIMARY_REACTIONS, ...activeExtraReactions.filter(r => !PRIMARY_REACTIONS.includes(r))];
        const availableExtras = EXTRA_REACTIONS.filter(r => !visibleReactions.includes(r) || (localReactions[r] || 0) === 0);
        
        return (
          <div className="flex flex-wrap gap-1 mb-3 justify-center">
            {visibleReactions.map(reaction => {
              const count = localReactions[reaction] || 0;
              const hasReacted = localUserReactions.includes(reaction);
              // Hide extra reactions with 0 count unless user reacted
              if (!PRIMARY_REACTIONS.includes(reaction) && count === 0 && !hasReacted) return null;
              
              return (
                <button
                  key={reaction}
                  onClick={() => handleReaction(reaction)}
                  className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-sm font-medium transition-all duration-200 active:scale-95 ${
                    hasReacted 
                      ? 'bg-primary/15 text-primary shadow-sm' 
                      : 'bg-secondary text-foreground hover:bg-secondary/80'
                  }`}
                >
                  <span className="text-base">{reaction}</span>
                  {count > 0 && <span className="text-xs">{count}</span>}
                </button>
              );
            })}
            {/* Plus button with emoji picker */}
            <Popover>
              <PopoverTrigger asChild>
                <button
                  className="flex items-center justify-center w-9 h-9 rounded-full bg-secondary text-muted-foreground hover:bg-secondary/80 hover:text-foreground transition-all duration-200 active:scale-95"
                >
                  <Plus size={16} />
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-2" side="top" align="center">
                <div className="grid grid-cols-5 gap-1">
                  {ALL_REACTIONS.filter(r => !localUserReactions.includes(r)).map(reaction => (
                    <button
                      key={reaction}
                      onClick={() => {
                        handleReaction(reaction);
                      }}
                      className="w-10 h-10 flex items-center justify-center rounded-lg text-xl hover:bg-secondary transition-colors active:scale-90"
                    >
                      {reaction}
                    </button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          </div>
        );
      })()}

      {/* Comments toggle */}
      <button
        onClick={() => setShowComments(!showComments)}
        className={`flex items-center gap-2 text-sm font-medium transition-all duration-200 ${
          showComments 
            ? 'text-primary' 
            : 'text-muted-foreground hover:text-foreground'
        }`}
      >
        <MessageCircle size={18} className={showComments ? 'fill-primary/20' : ''} />
        <span>
          {commentsCount > 0 
            ? `${t('subflow.comments')} (${commentsCount})` 
            : t('subflow.comment')
          }
        </span>
      </button>

      {/* Comments section */}
      {showComments && (
        <SubFlowComments
          postId={post.id}
          currentUserId={currentUserId}
          hasActiveSubscription={hasActiveSubscription}
        />
      )}

      {/* Lightbox */}
      {lightboxOpen && images.length > 0 && (
        <SubFlowImageViewer
          images={images}
          initialIndex={currentImageIndex}
          onClose={() => setLightboxOpen(false)}
          sourceRect={lightboxRect}
        />
      )}
    </div>
  );
}
