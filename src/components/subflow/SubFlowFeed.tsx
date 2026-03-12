import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { SubFlowPost } from './SubFlowPost';
import { SubFlowAdPost } from './SubFlowAdPost';
import { SubFlowPostSkeleton } from './SubFlowPostSkeleton';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll';
import { prefetchStoriesForUsers } from '@/hooks/useStoriesCache';
import { useUserAudienceMatch } from '@/hooks/useUserAudienceMatch';
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
  const { matchesAudience, isLoading: isAudienceLoading } = useUserAudienceMatch();

  const fetchPosts = useCallback(async (isInitial = true) => {
    try {
      if (isInitial) {
        setIsLoading(true);
        setPosts([]);
        lastCreatedAtRef.current = null;
        setHasMore(true);
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

      const { data: postsData, error: postsError } = await query;

      if (postsError) throw postsError;

      if (!postsData || postsData.length === 0) {
        if (isInitial) setPosts([]);
        setHasMore(false);
        setIsLoading(false);
        setIsLoadingMore(false);
        return;
      }

      lastCreatedAtRef.current = postsData[postsData.length - 1].created_at;
      setHasMore(postsData.length === POSTS_PER_PAGE);

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

  // Fetch ads and apply daily limit filtering
  const fetchAds = useCallback(async () => {
    const now = new Date().toISOString();
    const { data } = await supabase
      .from('subflow_ads')
      .select('id, title, content, image_url, link_type, link_value, shop_id, shop_name, frequency, daily_limit, starts_at, ends_at, audience_types')
      .eq('is_active', true);
    
    // Client-side filter by date range and audience
    const allAds = ((data as any[]) || []).filter(ad => {
      if (ad.starts_at && new Date(ad.starts_at) > new Date()) return false;
      if (ad.ends_at && new Date(ad.ends_at) < new Date()) return false;
      if (!matchesAudience(ad.audience_types)) return false;
      return true;
    });
    setAds(allAds);

    // Filter by daily limit per user
    if (!currentUserId || allAds.length === 0) {
      setFilteredAds(allAds);
      return;
    }

    const adsWithLimit = allAds.filter(a => a.daily_limit > 0);
    if (adsWithLimit.length === 0) {
      setFilteredAds(allAds);
      return;
    }

    // Check today's view counts for ads with daily limits
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

    const filtered = allAds.filter(ad => {
      if (ad.daily_limit <= 0) return true; // no limit
      const todayViews = viewCounts.get(ad.id) || 0;
      return todayViews < ad.daily_limit;
    });

    setFilteredAds(filtered);
  }, [currentUserId]);

  useEffect(() => {
    fetchPosts(true);
    fetchAds();
  }, [refreshTrigger, currentUserId, shopFilter]);

  // Fetch highlighted post if not in feed
  useEffect(() => {
    if (!highlightPostId) return;
    const exists = posts.some(p => p.id === highlightPostId);
    if (exists) return;

    (async () => {
      const { data: postData } = await supabase.from('subflow_posts').select('*').eq('id', highlightPostId).single();
      if (!postData) { onHighlightDone?.(); return; }

      const { data: profile } = await supabase.from('profiles').select('user_id, name, avatar_url, subflow_nickname').eq('user_id', postData.user_id).single();
      const { data: reactionsData } = await supabase.from('subflow_reactions').select('*').eq('post_id', highlightPostId);
      const { data: commentsData } = await supabase.from('subflow_comments').select('post_id').eq('post_id', highlightPostId);

      const counts: Record<string, number> = {};
      const userReactions: string[] = [];
      (reactionsData || []).forEach(r => {
        counts[r.reaction] = (counts[r.reaction] || 0) + 1;
        if (r.user_id === currentUserId) userReactions.push(r.reaction);
      });

      const enriched: Post = {
        id: postData.id, user_id: postData.user_id, content: postData.content,
        image_url: postData.image_url, image_urls: (postData as any).image_urls || [],
        shop_id: postData.shop_id, shop_name: postData.shop_name, created_at: postData.created_at,
        author_name: profile?.subflow_nickname || profile?.name || 'Пользователь',
        author_avatar: profile?.avatar_url || null, reactions: counts,
        user_reactions: userReactions, comments_count: commentsData?.length || 0,
      };
      setPosts(prev => [enriched, ...prev]);
    })();
  }, [highlightPostId]);

  // Realtime
  useEffect(() => {
    const channel = supabase
      .channel('subflow-realtime')
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
