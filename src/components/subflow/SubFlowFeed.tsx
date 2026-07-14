import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { SubFlowPost } from './SubFlowPost';
import { SubFlowAdPost } from './SubFlowAdPost';
import { SubFlowPostSkeleton } from './SubFlowPostSkeleton';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll';
import { prefetchStoriesForUsers } from '@/hooks/useStoriesCache';
import { useUserAudienceMatch } from '@/hooks/useUserAudienceMatch';
import { useUserStatsContext } from '@/contexts/UserStatsContext';
import { getBlockedUserIds } from '@/lib/subflowModeration';
import { Loader2 } from 'lucide-react';

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

interface RawSubFlowAd {
  id: string;
  title: string | null;
  content: string;
  image_url: string | null;
  link_type: string;
  link_value: string | null;
  shop_id: string | null;
  shop_name: string | null;
  frequency: number;
  daily_limit: number;
  audience_types: string[];
  starts_at: string | null;
  ends_at: string | null;
  country: string | null;
  city: string | null;
}

interface SubFlowAd {
  id: string;
  title: string | null;
  content: string;
  image_url: string | null;
  link_type: string;
  link_value: string | null;
  shop_id: string | null;
  shop_name: string | null;
  frequency: number;
  daily_limit: number;
}

interface SubFlowFeedProps {
  refreshTrigger: number;
  currentUserId: string | null;
  shopFilter?: string | null;
  hasActiveSubscription: boolean;
  highlightPostId?: string | null;
  onHighlightDone?: () => void;
}

const POSTS_PER_PAGE = 10;

export function SubFlowFeed({ refreshTrigger, currentUserId, shopFilter, hasActiveSubscription, highlightPostId, onHighlightDone }: SubFlowFeedProps) {
  const [posts, setPosts] = useState<Post[]>([]);
  const [rawAds, setRawAds] = useState<RawSubFlowAd[]>([]);
  const [filteredAds, setFilteredAds] = useState<SubFlowAd[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const lastCreatedAtRef = useRef<string | null>(null);
  // Заблокированные пользователи — их посты скрываем из ленты (App Store 1.2)
  const blockedIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!currentUserId) { blockedIdsRef.current = new Set(); return; }
    getBlockedUserIds().then(ids => { blockedIdsRef.current = ids; });
  }, [currentUserId]);
  const { matchesAudience, isLoading: isAudienceLoading } = useUserAudienceMatch();
  const { profile } = useUserStatsContext();
  const userCountry = profile?.country || 'KZ';
  const userCity = profile?.city || null;

  const fetchPosts = useCallback(async (isInitial = true) => {
    try {
      if (isInitial) {
        setIsLoading(true);
        setPosts([]);
        lastCreatedAtRef.current = null;
        setHasMore(true);
        // Актуализируем список заблокированных на КАЖДОЙ первичной загрузке —
        // иначе только что заблокированный автор оставался бы виден в ленте до
        // перемонтирования (blockedIdsRef иначе грузится один раз при mount).
        if (currentUserId) {
          try { blockedIdsRef.current = await getBlockedUserIds(); } catch { /* оставляем прежний список */ }
        }
      } else {
        setIsLoadingMore(true);
      }

      let query = supabase
        .from('subflow_posts')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(POSTS_PER_PAGE);

      if (shopFilter) {
        query = query.eq('shop_id', shopFilter);
      }

      if (!isInitial && lastCreatedAtRef.current) {
        query = query.lt('created_at', lastCreatedAtRef.current);
      }

      const { data: postsRaw, error: postsError } = await query;

      if (postsError) throw postsError;

      // Скрываем посты заблокированных пользователей (пагинация по created_at сохраняется).
      const postsData = (postsRaw || []).filter((p: any) => !blockedIdsRef.current.has(p.user_id));

      if (!postsRaw || postsRaw.length === 0) {
        if (isInitial) setPosts([]);
        setHasMore(false);
        setIsLoading(false);
        setIsLoadingMore(false);
        return;
      }

      // Курсор и hasMore — по СЫРОЙ странице (postsRaw), иначе при полностью
      // заблокированной странице курсор бы сломался.
      lastCreatedAtRef.current = postsRaw[postsRaw.length - 1].created_at;
      setHasMore(postsRaw.length === POSTS_PER_PAGE);

      const userIds = [...new Set(postsData.map(p => p.user_id))];
      
      const { data: profilesData } = await supabase
        .from('profiles')
        .select('user_id, name, avatar_url, subflow_nickname')
        .in('user_id', userIds);

      const profilesMap = new Map((profilesData || []).map(p => [p.user_id, p]));

      const postIds = postsData.map(p => p.id);
      const [{ data: reactionsData }, { data: commentsData }] = await Promise.all([
        supabase.from('subflow_reactions').select('*').in('post_id', postIds),
        supabase.from('subflow_comments').select('post_id').in('post_id', postIds),
      ]);

      const reactionsMap = new Map<string, { counts: Record<string, number>; userReactions: string[] }>();
      postIds.forEach(id => { reactionsMap.set(id, { counts: {}, userReactions: [] }); });

      (reactionsData || []).forEach(r => {
        const postReactions = reactionsMap.get(r.post_id);
        if (postReactions) {
          postReactions.counts[r.reaction] = (postReactions.counts[r.reaction] || 0) + 1;
          if (r.user_id === currentUserId) postReactions.userReactions.push(r.reaction);
        }
      });

      const commentsCountMap = new Map<string, number>();
      (commentsData || []).forEach(c => {
        commentsCountMap.set(c.post_id, (commentsCountMap.get(c.post_id) || 0) + 1);
      });

      const enrichedPosts: Post[] = postsData.map(post => {
        const profile = profilesMap.get(post.user_id);
        const reactions = reactionsMap.get(post.id) || { counts: {}, userReactions: [] };
        const displayName = profile?.subflow_nickname || profile?.name || 'Пользователь';
        return {
          id: post.id, user_id: post.user_id, content: post.content,
          image_url: post.image_url, image_urls: (post as any).image_urls || [],
          shop_id: post.shop_id, shop_name: post.shop_name, created_at: post.created_at,
          author_name: displayName, author_avatar: profile?.avatar_url || null,
          reactions: reactions.counts, user_reactions: reactions.userReactions,
          comments_count: commentsCountMap.get(post.id) || 0,
        };
      });

      const postUserIds = [...new Set(enrichedPosts.map(p => p.user_id))];
      prefetchStoriesForUsers(postUserIds);

      if (isInitial) setPosts(enrichedPosts);
      else setPosts(prev => [...prev, ...enrichedPosts]);
    } catch (error) {
      console.error('Error fetching posts:', error);
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  }, [currentUserId, shopFilter]);

  const loadMore = useCallback(() => {
    if (!isLoadingMore && hasMore) fetchPosts(false);
  }, [fetchPosts, isLoadingMore, hasMore]);

  const { loadMoreRef } = useInfiniteScroll({ onLoadMore: loadMore, hasMore, isLoading: isLoadingMore });

  // Fetch raw ads (no audience filtering - that's done reactively below)
  const fetchAds = useCallback(async () => {
    const { data } = await supabase
      .from('subflow_ads')
      .select('id, title, content, image_url, link_type, link_value, shop_id, shop_name, frequency, daily_limit, starts_at, ends_at, audience_types, country, city')
      .eq('is_active', true);
    
    // Client-side filter by date range and country/city
    const filtered = ((data as RawSubFlowAd[]) || []).filter(ad => {
      if (ad.starts_at && new Date(ad.starts_at) > new Date()) return false;
      if (ad.ends_at && new Date(ad.ends_at) < new Date()) return false;
      if (ad.country && ad.country !== userCountry) return false;
      if (ad.city && userCity && ad.city !== userCity) return false;
      return true;
    });
    setRawAds(filtered);
  }, [userCountry, userCity]);

  // Reactively filter by audience when matchesAudience updates
  const audienceFilteredAds = useMemo(() => {
    if (isAudienceLoading) return [];
    return rawAds.filter(ad => matchesAudience(ad.audience_types));
  }, [rawAds, matchesAudience, isAudienceLoading]);

  // Apply daily limit filtering on top of audience-filtered ads
  useEffect(() => {
    const applyDailyLimits = async () => {
      if (!currentUserId || audienceFilteredAds.length === 0) {
        setFilteredAds(audienceFilteredAds);
        return;
      }

      const adsWithLimit = audienceFilteredAds.filter(a => a.daily_limit > 0);
      if (adsWithLimit.length === 0) {
        setFilteredAds(audienceFilteredAds);
        return;
      }

      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const { data: todayEvents } = await supabase
        .from('subflow_ad_events')
        .select('ad_id')
        .eq('user_id', currentUserId)
        .eq('event_type', 'view')
        .gte('created_at', todayStart.toISOString())
        .in('ad_id', adsWithLimit.map(a => a.id));

      const viewCounts = new Map<string, number>();
      (todayEvents || []).forEach((e: any) => {
        viewCounts.set(e.ad_id, (viewCounts.get(e.ad_id) || 0) + 1);
      });

      const filtered = audienceFilteredAds.filter(ad => {
        if (ad.daily_limit <= 0) return true;
        const todayViews = viewCounts.get(ad.id) || 0;
        return todayViews < ad.daily_limit;
      });

      setFilteredAds(filtered);
    };

    applyDailyLimits();
  }, [audienceFilteredAds, currentUserId]);

  useEffect(() => {
    fetchPosts(true);
    fetchAds();
  }, [refreshTrigger, currentUserId, shopFilter]);

  // Диплинк/уведомление на конкретный пост: НЕ добавляем его в начало ленты
  // (иначе он дублировался — сверху + в своей естественной позиции). Вместо этого
  // подгружаем ленту, пока пост не окажется загруженным, и тогда SubFlowPost сам
  // проскроллит к нему и подсветит (isHighlighted). Ограничение — чтобы не тянуть
  // всю ленту, если пост старый/удалён.
  const highlightAttemptsRef = useRef(0);
  useEffect(() => {
    if (!highlightPostId) { highlightAttemptsRef.current = 0; return; }
    if (isLoading || isLoadingMore) return;
    if (posts.some(p => p.id === highlightPostId)) return; // найден — подсветка/скролл в SubFlowPost
    if (hasMore && highlightAttemptsRef.current < 5) {
      highlightAttemptsRef.current += 1;
      loadMore();
    } else {
      onHighlightDone?.(); // не нашли (старый/удалён) — просто остаёмся в ленте
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlightPostId, posts, hasMore, isLoading, isLoadingMore]);

  // Realtime
  useEffect(() => {
    const channel = supabase
      .channel('subflow-realtime-' + Math.random().toString(36).slice(2))
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'subflow_posts' }, (payload) => {
        const newPost = payload.new as any;
        supabase.from('profiles').select('user_id, name, avatar_url, subflow_nickname').eq('user_id', newPost.user_id).single()
          .then(({ data: profile }) => {
            const displayName = profile?.subflow_nickname || profile?.name || 'Пользователь';
            const enrichedPost: Post = {
              id: newPost.id, user_id: newPost.user_id, content: newPost.content,
              image_url: newPost.image_url, image_urls: newPost.image_urls || [],
              shop_id: newPost.shop_id, shop_name: newPost.shop_name,
              created_at: newPost.created_at, author_name: displayName,
              author_avatar: profile?.avatar_url || null, reactions: {},
              user_reactions: [], comments_count: 0,
            };
            if (!shopFilter || newPost.shop_id === shopFilter) {
              setPosts(prev => [enrichedPost, ...prev]);
            }
          });
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'subflow_posts' }, (payload) => {
        setPosts(prev => prev.filter(p => p.id !== payload.old.id));
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'subflow_reactions' }, () => {})
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [currentUserId, shopFilter]);

  if (isLoading) return <SubFlowPostSkeleton count={4} />;

  if (posts.length === 0) {
    return (
      <div className="text-center py-16">
        <div className="text-6xl mb-4 animate-bounce">☕</div>
        <p className="text-xl font-bold text-foreground mb-2">Пока тихо...</p>
        <p className="text-sm text-muted-foreground max-w-[200px] mx-auto">
          Будь первым, кто поделится впечатлениями о любимой кофейне!
        </p>
      </div>
    );
  }

  // Build feed with ads inserted at configured frequency, respecting daily limits
  // Pre-compute which ads go where, tracking per-ad render count vs daily_limit
  const buildAdPlacements = (): Map<number, SubFlowAd> => {
    const placements = new Map<number, SubFlowAd>();
    if (filteredAds.length === 0) return placements;

    // Track how many times each ad has been placed in this render
    const renderCounts = new Map<string, number>();

    for (let i = 0; i < posts.length; i++) {
      for (const ad of filteredAds) {
        if (ad.frequency > 0 && (i + 1) % ad.frequency === 0) {
          const shown = renderCounts.get(ad.id) || 0;
          // If daily_limit > 0, cap placements to daily_limit
          if (ad.daily_limit > 0 && shown >= ad.daily_limit) continue;
          renderCounts.set(ad.id, shown + 1);
          placements.set(i, ad);
          break; // only one ad per position
        }
      }
    }
    return placements;
  };

  const adPlacements = buildAdPlacements();

  return (
    <div className="space-y-4">
      {posts.map((post, index) => {
        const adToShow = adPlacements.get(index) || null;
        return (
          <div key={post.id}>
            <SubFlowPost
              post={post}
              currentUserId={currentUserId}
              onUpdate={() => fetchPosts(true)}
              animationDelay={index < 10 ? index * 0.05 : 0}
              hasActiveSubscription={hasActiveSubscription}
              isHighlighted={highlightPostId === post.id}
              onHighlightDone={onHighlightDone}
            />
            {adToShow && (
              <div className="mt-4">
                <SubFlowAdPost key={`ad-${adToShow.id}-${index}`} ad={adToShow} currentUserId={currentUserId} />
              </div>
            )}
          </div>
        );
      })}
      
      <div ref={loadMoreRef} className="h-4" />
      
      {isLoadingMore && (
        <div className="flex items-center justify-center py-4">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      )}
      
      {!hasMore && posts.length > 0 && (
        <p className="text-center text-sm text-muted-foreground py-4">
          Это все посты 🎉
        </p>
      )}
    </div>
  );
}
