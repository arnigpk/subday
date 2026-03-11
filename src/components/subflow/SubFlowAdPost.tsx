import { useNavigate } from 'react-router-dom';
import { useState, useEffect, useRef } from 'react';
import { Badge } from '@/components/ui/badge';
import { Megaphone, ExternalLink, MessageCircle } from 'lucide-react';
import { openWithDeepLink } from '@/utils/deepLinks';
import { supabase } from '@/integrations/supabase/client';
import { SubFlowAdComments } from './SubFlowAdComments';
import { toast } from 'sonner';
import { useVibration } from '@/hooks/useVibration';

interface SubFlowAd {
  id: string;
  title: string | null;
  content: string;
  image_url: string | null;
  link_type: string;
  link_value: string | null;
  shop_id: string | null;
  shop_name: string | null;
}

interface SubFlowAdPostProps {
  ad: SubFlowAd;
  currentUserId?: string | null;
}

const REACTIONS = ['💚', '👍', '🔥', '🚀', '⚡️'];
const MAX_REACTIONS_PER_USER = 2;

export function SubFlowAdPost({ ad, currentUserId }: SubFlowAdPostProps) {
  const navigate = useNavigate();
  const viewTracked = useRef(false);
  const { vibrateShort } = useVibration();
  
  const [localReactions, setLocalReactions] = useState<Record<string, number>>({});
  const [localUserReactions, setLocalUserReactions] = useState<string[]>([]);
  const [showComments, setShowComments] = useState(false);
  const [commentsCount, setCommentsCount] = useState(0);
  const [processedReactionIds] = useState(() => new Set<string>());
  const [pendingReactions] = useState(() => new Set<string>());

  // Fetch initial reactions and comments count
  useEffect(() => {
    const fetchData = async () => {
      const [{ data: reactionsData }, { data: commentsData }] = await Promise.all([
        supabase.from('subflow_ad_reactions' as any).select('*').eq('ad_id', ad.id),
        supabase.from('subflow_ad_comments' as any).select('id').eq('ad_id', ad.id),
      ]);

      const counts: Record<string, number> = {};
      const userReacs: string[] = [];
      ((reactionsData as any[]) || []).forEach((r: any) => {
        counts[r.reaction] = (counts[r.reaction] || 0) + 1;
        if (r.user_id === currentUserId) userReacs.push(r.reaction);
      });
      setLocalReactions(counts);
      setLocalUserReactions(userReacs);
      setCommentsCount((commentsData as any[])?.length || 0);
    };
    fetchData();
  }, [ad.id, currentUserId]);

  // Real-time reactions
  useEffect(() => {
    const channel = supabase
      .channel(`ad-reactions-${ad.id}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'subflow_ad_reactions',
        filter: `ad_id=eq.${ad.id}`
      }, (payload) => {
        const nr = payload.new as any;
        const key = `${nr.user_id}-${nr.reaction}`;
        if (processedReactionIds.has(nr.id)) return;
        processedReactionIds.add(nr.id);
        if (nr.user_id === currentUserId && pendingReactions.has(key)) {
          pendingReactions.delete(key);
          return;
        }
        setLocalReactions(prev => ({ ...prev, [nr.reaction]: (prev[nr.reaction] || 0) + 1 }));
        if (nr.user_id === currentUserId) {
          setLocalUserReactions(prev => prev.includes(nr.reaction) ? prev : [...prev, nr.reaction]);
        }
      })
      .on('postgres_changes', {
        event: 'DELETE', schema: 'public', table: 'subflow_ad_reactions',
        filter: `ad_id=eq.${ad.id}`
      }, (payload) => {
        const dr = payload.old as any;
        const key = `${dr.user_id}-${dr.reaction}`;
        if (dr.user_id === currentUserId && pendingReactions.has(`del-${key}`)) {
          pendingReactions.delete(`del-${key}`);
          return;
        }
        setLocalReactions(prev => ({ ...prev, [dr.reaction]: Math.max(0, (prev[dr.reaction] || 1) - 1) }));
        if (dr.user_id === currentUserId) {
          setLocalUserReactions(prev => prev.filter(r => r !== dr.reaction));
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [ad.id, currentUserId, processedReactionIds, pendingReactions]);

  // Real-time comments count
  useEffect(() => {
    const channel = supabase
      .channel(`ad-comments-count-${ad.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'subflow_ad_comments', filter: `ad_id=eq.${ad.id}` }, () => {
        setCommentsCount(prev => prev + 1);
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'subflow_ad_comments', filter: `ad_id=eq.${ad.id}` }, () => {
        setCommentsCount(prev => Math.max(0, prev - 1));
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [ad.id]);

  // Track view on mount
  useEffect(() => {
    if (viewTracked.current) return;
    viewTracked.current = true;

    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) return;
      supabase.from('subflow_ad_events').insert({
        ad_id: ad.id,
        user_id: data.user.id,
        event_type: 'view',
      }).then(({ error }) => {
        if (error) console.error('Ad view track error:', error);
      });
    });
  }, [ad.id]);

  const trackClick = async () => {
    const { data } = await supabase.auth.getUser();
    if (data.user) {
      await supabase.from('subflow_ad_events').insert({
        ad_id: ad.id, user_id: data.user.id, event_type: 'click',
      });
    }
  };

  const handleClick = async () => {
    await trackClick();
    if (ad.link_type === 'shop' && ad.link_value) {
      navigate(`/shops/${ad.link_value}`);
    } else if (ad.link_value) {
      openWithDeepLink(ad.link_value);
    }
  };

  const handleReaction = async (reaction: string) => {
    if (!currentUserId) {
      toast.error('Войдите чтобы реагировать');
      return;
    }

    vibrateShort();

    const hasReaction = localUserReactions.includes(reaction);
    const reactionKey = `${currentUserId}-${reaction}`;

    if (!hasReaction && localUserReactions.length >= MAX_REACTIONS_PER_USER) {
      toast.error(`Максимум ${MAX_REACTIONS_PER_USER} реакции на пост`);
      return;
    }

    if (hasReaction) {
      pendingReactions.add(`del-${reactionKey}`);
    } else {
      pendingReactions.add(reactionKey);
    }

    // Optimistic update
    if (hasReaction) {
      setLocalUserReactions(prev => prev.filter(r => r !== reaction));
      setLocalReactions(prev => ({ ...prev, [reaction]: Math.max(0, (prev[reaction] || 1) - 1) }));
    } else {
      setLocalUserReactions(prev => [...prev, reaction]);
      setLocalReactions(prev => ({ ...prev, [reaction]: (prev[reaction] || 0) + 1 }));
    }

    try {
      if (hasReaction) {
        await supabase
          .from('subflow_ad_reactions' as any)
          .delete()
          .eq('ad_id', ad.id)
          .eq('user_id', currentUserId)
          .eq('reaction', reaction);
      } else {
        const { error } = await supabase
          .from('subflow_ad_reactions' as any)
          .upsert({
            ad_id: ad.id, user_id: currentUserId, reaction
          } as any, { onConflict: 'user_id,ad_id,reaction' });

        if (error) {
          console.error('Ad reaction rejected:', error.message);
          pendingReactions.delete(reactionKey);
          // Revert
          setLocalUserReactions(prev => prev.filter(r => r !== reaction));
          setLocalReactions(prev => ({ ...prev, [reaction]: Math.max(0, (prev[reaction] || 1) - 1) }));
          return;
        }
      }
    } catch (error) {
      console.error('Ad reaction error:', error);
      pendingReactions.delete(reactionKey);
      pendingReactions.delete(`del-${reactionKey}`);
    }
  };

  return (
    <div className="card-static animate-slide-up border border-accent/30 bg-gradient-to-br from-accent/10 via-accent/5 to-transparent shadow-md">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-full bg-accent/20 flex items-center justify-center shadow-sm">
            <Megaphone size={18} className="text-accent" />
          </div>
          <div>
            <p className="text-sm font-bold text-foreground tracking-tight">
              {ad.title || ad.shop_name || 'subday'}
            </p>
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-accent/40 text-accent font-bold uppercase tracking-wider">
              реклама
            </Badge>
          </div>
        </div>
      </div>

      <p className="text-[15px] text-foreground leading-relaxed mb-3 whitespace-pre-wrap font-medium">{ad.content}</p>

      {ad.image_url && (
        <div className="mb-3 -mx-4 overflow-hidden">
          <img src={ad.image_url} alt="Реклама" className="w-full object-cover" loading="lazy" />
        </div>
      )}

      {ad.link_value && (
        <button
          onClick={handleClick}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-[hsl(0,60%,30%)] text-white font-bold text-sm hover:bg-[hsl(0,60%,25%)] active:scale-[0.98] transition-all shadow-sm mb-3"
        >
          <ExternalLink size={15} />
          {ad.link_type === 'shop' ? 'Перейти в кофейню' :
           ad.link_type === 'instagram' ? 'Открыть Instagram' :
           ad.link_type === 'whatsapp' ? 'Написать в WhatsApp' :
           ad.link_type === 'telegram' ? 'Открыть Telegram' :
           'Подробнее'}
        </button>
      )}

      {/* Reactions */}
      <div className="flex flex-wrap gap-1 mb-3">
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
          {commentsCount > 0
            ? `Комментарии (${commentsCount})`
            : 'Комментировать'
          }
        </span>
      </button>

      {/* Comments section */}
      {showComments && (
        <SubFlowAdComments adId={ad.id} currentUserId={currentUserId || null} />
      )}
    </div>
  );
}
