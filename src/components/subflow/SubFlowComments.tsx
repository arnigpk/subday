import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { User, Send, Trash2 } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { ru } from 'date-fns/locale';
import { toast } from 'sonner';

interface Comment {
  id: string;
  user_id: string;
  content: string;
  created_at: string;
  author_name: string;
  author_avatar: string | null;
}

interface SubFlowCommentsProps {
  postId: string;
  currentUserId: string | null;
  hasActiveSubscription: boolean;
}

export function SubFlowComments({ postId, currentUserId, hasActiveSubscription }: SubFlowCommentsProps) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [newComment, setNewComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchComments = async () => {
    try {
      const { data: commentsData, error } = await supabase
        .from('subflow_comments')
        .select('*')
        .eq('post_id', postId)
        .order('created_at', { ascending: true });

      if (error) throw error;

      if (!commentsData || commentsData.length === 0) {
        setComments([]);
        setIsLoading(false);
        return;
      }

      // Get user profiles
      const userIds = [...new Set(commentsData.map(c => c.user_id))];
      const { data: profilesData } = await supabase
        .from('profiles')
        .select('user_id, name, avatar_url')
        .in('user_id', userIds);

      const profilesMap = new Map(
        (profilesData || []).map(p => [p.user_id, p])
      );

      const enrichedComments: Comment[] = commentsData.map(comment => {
        const profile = profilesMap.get(comment.user_id);
        return {
          id: comment.id,
          user_id: comment.user_id,
          content: comment.content,
          created_at: comment.created_at,
          author_name: profile?.name || 'Пользователь',
          author_avatar: profile?.avatar_url || null,
        };
      });

      setComments(enrichedComments);
    } catch (error) {
      console.error('Error fetching comments:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchComments();
  }, [postId]);

  const formatDate = (dateStr: string) => {
    try {
      const date = parseISO(dateStr);
      return format(date, 'd MMM в HH:mm', { locale: ru });
    } catch {
      return dateStr;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!currentUserId) {
      toast.error('Войдите, чтобы комментировать');
      return;
    }

    if (!newComment.trim()) return;

    setIsSubmitting(true);
    try {
      const { error } = await supabase
        .from('subflow_comments')
        .insert({
          post_id: postId,
          user_id: currentUserId,
          content: newComment.trim()
        });

      if (error) throw error;

      setNewComment('');
      fetchComments();
    } catch (error) {
      console.error('Comment error:', error);
      toast.error('Ошибка отправки комментария');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (commentId: string) => {
    try {
      const { error } = await supabase
        .from('subflow_comments')
        .delete()
        .eq('id', commentId);

      if (error) throw error;
      fetchComments();
    } catch (error) {
      console.error('Delete comment error:', error);
      toast.error('Ошибка удаления');
    }
  };

  return (
    <div className="mt-4 pt-4 border-t border-border">
      {/* Comment input */}
      <form onSubmit={handleSubmit} className="flex gap-2 mb-4">
        <input
          type="text"
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          placeholder="Написать комментарий..."
          className="flex-1 px-3 py-2 bg-secondary rounded-xl text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
        />
        <button
          type="submit"
          disabled={isSubmitting || !newComment.trim()}
          className="p-2 bg-primary text-primary-foreground rounded-xl disabled:opacity-50"
        >
          <Send size={18} />
        </button>
      </form>

      {/* Comments list */}
      {isLoading ? (
        <div className="text-center py-4">
          <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
        </div>
      ) : comments.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-2">
          Пока нет комментариев
        </p>
      ) : (
        <div className="space-y-3">
          {comments.map(comment => (
            <div key={comment.id} className="flex gap-2">
              {hasActiveSubscription ? (
                <Avatar className="w-8 h-8 flex-shrink-0">
                  {comment.author_avatar ? (
                    <AvatarImage src={comment.author_avatar} alt={comment.author_name} />
                  ) : null}
                  <AvatarFallback className="bg-primary/10">
                    <User size={14} className="text-primary" />
                  </AvatarFallback>
                </Avatar>
              ) : (
                <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                  <User size={14} className="text-muted-foreground" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  {hasActiveSubscription ? (
                    <span className="text-sm font-medium text-foreground">{comment.author_name}</span>
                  ) : (
                    <span className="text-sm font-medium text-muted-foreground">Автор скрыт</span>
                  )}
                  <span className="text-xs text-muted-foreground">{formatDate(comment.created_at)}</span>
                  {comment.user_id === currentUserId && (
                    <button
                      onClick={() => handleDelete(comment.id)}
                      className="ml-auto p-1 text-muted-foreground hover:text-destructive transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
                <p className="text-sm text-foreground">{comment.content}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
