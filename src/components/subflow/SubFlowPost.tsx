import { useState, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { MessageCircle, Trash2, MapPin, ChevronLeft, ChevronRight, Pencil, X, Check } from 'lucide-react';
import { format, parseISO, differenceInMinutes } from 'date-fns';
import { ru } from 'date-fns/locale';
import { SubFlowComments } from './SubFlowComments';
import { StoryAvatar } from '@/components/stories/StoryAvatar';
import { toast } from 'sonner';

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
}

const REACTIONS = ['💚', '🚀', '🔥', '⚡️', '👍'];
const MAX_REACTIONS_PER_USER = 2;

export function SubFlowPost({ post, currentUserId, onUpdate, animationDelay }: SubFlowPostProps) {
  const [showComments, setShowComments] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(post.content);
  const [isSaving, setIsSaving] = useState(false);
  const [localReactions, setLocalReactions] = useState(post.reactions);
  const [localUserReactions, setLocalUserReactions] = useState(post.user_reactions);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  const isOwner = currentUserId === post.user_id;
  
  // Check if post can be edited (within 1 hour of creation)
  const canEdit = useMemo(() => {
    if (!isOwner) return false;
    const createdAt = parseISO(post.created_at);
    const minutesSinceCreation = differenceInMinutes(new Date(), createdAt);
    return minutesSinceCreation <= 60;
  }, [isOwner, post.created_at]);
  
  // Get all images - prefer image_urls array, fallback to single image_url
  const images = post.image_urls?.length ? post.image_urls : (post.image_url ? [post.image_url] : []);

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
      toast.error('Войдите, чтобы реагировать');
      return;
    }

    const hasReaction = localUserReactions.includes(reaction);
    
    // Check if user already has max reactions and trying to add new one
    if (!hasReaction && localUserReactions.length >= MAX_REACTIONS_PER_USER) {
      toast.error(`Максимум ${MAX_REACTIONS_PER_USER} реакции на пост`);
      return;
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
        await supabase
          .from('subflow_reactions')
          .insert({
            post_id: post.id,
            user_id: currentUserId,
            reaction
          });
      }
    } catch (error) {
      console.error('Reaction error:', error);
      // Revert on error
      onUpdate();
    }
  };

  const handleDelete = async () => {
    if (!confirm('Удалить этот пост?')) return;
    
    setIsDeleting(true);
    try {
      const { error } = await supabase
        .from('subflow_posts')
        .delete()
        .eq('id', post.id);

      if (error) throw error;
      toast.success('Пост удалён');
      onUpdate();
    } catch (error) {
      console.error('Delete error:', error);
      toast.error('Ошибка удаления');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleSaveEdit = async () => {
    if (!editContent.trim()) {
      toast.error('Напишите что-нибудь');
      return;
    }

    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('subflow_posts')
        .update({ content: editContent.trim() })
        .eq('id', post.id);

      if (error) throw error;
      toast.success('Пост обновлён');
      setIsEditing(false);
      onUpdate();
    } catch (error) {
      console.error('Edit error:', error);
      toast.error('Ошибка сохранения');
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
      className="card-static animate-slide-up"
      style={{ animationDelay: `${animationDelay}s` }}
    >
      {/* Header */}
      <div className="flex items-center gap-3 mb-3">
        <StoryAvatar
          userId={post.user_id}
          userName={post.author_name}
          userAvatar={post.author_avatar}
          currentUserId={currentUserId}
          size="md"
        />
        <div className="flex-1 min-w-0">
          <p className="font-bold text-foreground truncate">{post.author_name}</p>
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
          {isOwner && (
            <button
              onClick={handleDelete}
              disabled={isDeleting}
              className="p-2 rounded-full text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all"
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
              <span>{isSaving ? 'Сохранение...' : 'Сохранить'}</span>
            </button>
            <button
              onClick={handleCancelEdit}
              className="flex items-center gap-1 px-3 py-1.5 bg-secondary text-foreground rounded-lg text-sm font-medium"
            >
              <X size={14} />
              <span>Отмена</span>
            </button>
          </div>
        </div>
      ) : (
        <p className="text-foreground leading-relaxed mb-3 whitespace-pre-wrap">{post.content}</p>
      )}

      {/* Images carousel */}
      {images.length > 0 && (
        <div className="mb-4 -mx-4 overflow-hidden relative">
          <img
            src={images[currentImageIndex]}
            alt={`Post image ${currentImageIndex + 1}`}
            className="w-full h-auto max-h-96 object-cover"
            loading="lazy"
          />
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
      <div className="flex flex-wrap gap-1.5 mb-3">
        {REACTIONS.map(reaction => {
          const count = localReactions[reaction] || 0;
          const hasReacted = localUserReactions.includes(reaction);
          
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
      </div>

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
          {post.comments_count > 0 
            ? `Комментарии (${post.comments_count})` 
            : 'Комментировать'
          }
        </span>
      </button>

      {/* Comments section */}
      {showComments && (
        <SubFlowComments
          postId={post.id}
          currentUserId={currentUserId}
        />
      )}
    </div>
  );
}
