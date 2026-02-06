import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { User, MessageCircle, Trash2, MapPin } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { ru } from 'date-fns/locale';
import { SubFlowComments } from './SubFlowComments';
import { toast } from 'sonner';

interface Post {
  id: string;
  user_id: string;
  content: string;
  image_url: string | null;
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

const REACTIONS = ['💚', '🚀', '🔥', '⚡️', '👍', '🥹'];

export function SubFlowPost({ post, currentUserId, onUpdate, animationDelay }: SubFlowPostProps) {
  const [showComments, setShowComments] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [localReactions, setLocalReactions] = useState(post.reactions);
  const [localUserReactions, setLocalUserReactions] = useState(post.user_reactions);

  const isOwner = currentUserId === post.user_id;

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

  return (
    <div 
      className="bg-card/80 backdrop-blur-sm border border-border/50 rounded-2xl p-4 shadow-sm hover:shadow-md transition-all duration-300 animate-slide-up"
      style={{ animationDelay: `${animationDelay}s` }}
    >
      {/* Header */}
      <div className="flex items-center gap-3 mb-3">
        <Avatar className="w-11 h-11 ring-2 ring-primary/20 ring-offset-2 ring-offset-background">
          {post.author_avatar ? (
            <AvatarImage src={post.author_avatar} alt={post.author_name} className="object-cover" />
          ) : null}
          <AvatarFallback className="bg-gradient-to-br from-primary/20 to-accent/20">
            <User size={20} className="text-primary" />
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-foreground truncate">{post.author_name}</p>
          <p className="text-xs text-muted-foreground/70">{formatDate(post.created_at)}</p>
        </div>
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

      {/* Shop tag */}
      {post.shop_name && (
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-primary/10 text-primary rounded-full text-xs font-medium mb-3">
          <MapPin size={12} />
          <span>{post.shop_name}</span>
        </div>
      )}

      {/* Content */}
      <p className="text-foreground leading-relaxed mb-3 whitespace-pre-wrap">{post.content}</p>

      {/* Image */}
      {post.image_url && (
        <div className="mb-4 -mx-4 overflow-hidden">
          <img
            src={post.image_url}
            alt="Post image"
            className="w-full h-auto max-h-96 object-cover"
            loading="lazy"
          />
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
                  ? 'bg-gradient-to-r from-primary/25 to-accent/25 text-primary shadow-sm' 
                  : 'bg-secondary/80 text-foreground hover:bg-secondary hover:scale-105'
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
