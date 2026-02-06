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

const REACTIONS = ['🚀', '🔥', '⚡️', '👍', '🥹'];

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
      className="card-static animate-slide-up"
      style={{ animationDelay: `${animationDelay}s` }}
    >
      {/* Header */}
      <div className="flex items-center gap-3 mb-3">
        <Avatar className="w-10 h-10">
          {post.author_avatar ? (
            <AvatarImage src={post.author_avatar} alt={post.author_name} />
          ) : null}
          <AvatarFallback className="bg-primary/10">
            <User size={20} className="text-primary" />
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-foreground truncate">{post.author_name}</p>
          <p className="text-xs text-muted-foreground">{formatDate(post.created_at)}</p>
        </div>
        {isOwner && (
          <button
            onClick={handleDelete}
            disabled={isDeleting}
            className="p-2 text-muted-foreground hover:text-destructive transition-colors"
          >
            <Trash2 size={18} />
          </button>
        )}
      </div>

      {/* Shop tag */}
      {post.shop_name && (
        <div className="flex items-center gap-1 text-xs text-muted-foreground mb-2">
          <MapPin size={12} />
          <span>{post.shop_name}</span>
        </div>
      )}

      {/* Content */}
      <p className="text-foreground mb-3 whitespace-pre-wrap">{post.content}</p>

      {/* Image */}
      {post.image_url && (
        <div className="mb-3 rounded-xl overflow-hidden">
          <img
            src={post.image_url}
            alt="Post image"
            className="w-full h-auto max-h-80 object-cover"
            loading="lazy"
          />
        </div>
      )}

      {/* Reactions */}
      <div className="flex flex-wrap gap-2 mb-3">
        {REACTIONS.map(reaction => {
          const count = localReactions[reaction] || 0;
          const hasReacted = localUserReactions.includes(reaction);
          
          return (
            <button
              key={reaction}
              onClick={() => handleReaction(reaction)}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-sm transition-all ${
                hasReacted 
                  ? 'bg-primary/20 text-primary' 
                  : 'bg-secondary text-foreground hover:bg-secondary/80'
              }`}
            >
              <span>{reaction}</span>
              {count > 0 && <span className="text-xs font-medium">{count}</span>}
            </button>
          );
        })}
      </div>

      {/* Comments toggle */}
      <button
        onClick={() => setShowComments(!showComments)}
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <MessageCircle size={18} />
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
