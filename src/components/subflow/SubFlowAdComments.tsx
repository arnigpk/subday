import { LinkifiedText } from '@/components/subflow/LinkifiedText';
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { User, Send, Trash2 } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { ru } from 'date-fns/locale';
import { toast } from 'sonner';
import { useLanguage } from '@/contexts/LanguageContext';

interface Comment {
  id: string;
  user_id: string;
  content: string;
  created_at: string;
  author_name: string;
  author_avatar: string | null;
}

interface SubFlowAdCommentsProps {
  adId: string;
  currentUserId: string | null;
}

export function SubFlowAdComments({ adId, currentUserId }: SubFlowAdCommentsProps) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [newComment, setNewComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { t } = useLanguage();

  const fetchComments = useCallback(async () => {
    try {
      const { data: commentsData, error } = await supabase
        .from('subflow_ad_comments' as any)
        .select('*')
        .eq('ad_id', adId)
        .order('created_at', { ascending: true });

      if (error) throw error;

      if (!commentsData || commentsData.length === 0) {
        setComments([]);
        setIsLoading(false);
        return;
      }

      const userIds = [...new Set((commentsData as any[]).map((c: any) => c.user_id))];
      const { data: profilesData } = await supabase
        .from('profiles')
        .select('user_id, name, avatar_url, subflow_nickname')
        .in('user_id', userIds);

      const profilesMap = new Map(
        (profilesData || []).map(p => [p.user_id, p])
      );

      const enrichedComments: Comment[] = (commentsData as any[]).map((comment: any) => {
        const profile = profilesMap.get(comment.user_id);
        const displayName = profile?.subflow_nickname || profile?.name || 'Пользователь';
        return {
          id: comment.id,
          user_id: comment.user_id,
          content: comment.content,
          created_at: comment.created_at,
          author_name: displayName,
          author_avatar: profile?.avatar_url || null,
        };
      });

      setComments(enrichedComments);
    } catch (error) {
      console.error('Error fetching ad comments:', error);
    } finally {
      setIsLoading(false);
    }
  }, [adId]);

  useEffect(() => {
    fetchComments();
  }, [fetchComments]);

  // Real-time subscription
  useEffect(() => {
    const channel = supabase
      .channel(`ad-comments-${adId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'subflow_ad_comments',
        filter: `ad_id=eq.${adId}`
      }, async (payload) => {
        const newC = payload.new as any;

        const { data: profile } = await supabase
          .from('profiles')
          .select('user_id, name, avatar_url, subflow_nickname')
          .eq('user_id', newC.user_id)
          .single();

        const enriched: Comment = {
          id: newC.id,
          user_id: newC.user_id,
          content: newC.content,
          created_at: newC.created_at,
          author_name: profile?.subflow_nickname || profile?.name || 'Пользователь',
          author_avatar: profile?.avatar_url || null,
        };

        setComments(prev => {
          if (prev.some(c => c.id === enriched.id)) return prev;
          return [...prev, enriched];
        });
      })
      .on('postgres_changes', {
        event: 'DELETE',
        schema: 'public',
        table: 'subflow_ad_comments',
        filter: `ad_id=eq.${adId}`
      }, (payload) => {
        setComments(prev => prev.filter(c => c.id !== payload.old.id));
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [adId]);

  const formatDate = (dateStr: string) => {
    try {
      return format(parseISO(dateStr), 'd MMM в HH:mm', { locale: ru });
    } catch {
      return dateStr;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUserId) {
      toast.error(t('subflow.loginToComment'));
      return;
    }
    if (!newComment.trim()) return;

    setIsSubmitting(true);
    try {
      const { error } = await supabase
        .from('subflow_ad_comments' as any)
        .insert({
          ad_id: adId,
          user_id: currentUserId,
          content: newComment.trim()
        } as any);

      if (error) throw error;
      setNewComment('');
      fetchComments();
    } catch (error) {
      console.error('Ad comment error:', error);
      toast.error(t('subflow.commentError'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (commentId: string) => {
    try {
      const { error } = await supabase
        .from('subflow_ad_comments' as any)
        .delete()
        .eq('id', commentId);

      if (error) throw error;
      fetchComments();
    } catch (error) {
      console.error('Delete ad comment error:', error);
      toast.error(t('subflow.deleteError'));
    }
  };

  return (
    <div className="mt-4 pt-4 border-t border-border">
      <form onSubmit={handleSubmit} className="flex gap-2 mb-4">
        <input
          type="text"
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          placeholder={t('subflow.commentPlaceholder')}
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

      {isLoading ? (
        <div className="text-center py-4">
          <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
        </div>
      ) : comments.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-2">
          {t('subflow.noComments')}
        </p>
      ) : (
        <div className="space-y-3">
          {comments.map(comment => (
            <div key={comment.id} className="flex gap-2">
              <Avatar className="w-8 h-8 flex-shrink-0 ring-2 ring-primary/20">
                {comment.author_avatar ? (
                  <AvatarImage src={comment.author_avatar} alt={comment.author_name} className="object-cover" />
                ) : null}
                <AvatarFallback className="bg-primary/10">
                  <User size={14} className="text-primary" />
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-foreground">{comment.author_name}</span>
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
                <p className="text-sm text-foreground whitespace-pre-wrap"><LinkifiedText text={comment.content} /></p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
