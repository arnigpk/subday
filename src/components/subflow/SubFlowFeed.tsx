import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { SubFlowPost } from './SubFlowPost';
import { SubFlowPostSkeleton } from './SubFlowPostSkeleton';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll';
import { prefetchStoriesForUsers } from '@/hooks/useStoriesCache';
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
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const lastCreatedAtRef = useRef<string | null>(null);

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
        if (isInitial) {
          setPosts([]);
        }
        setHasMore(false);
        setIsLoading(false);
        setIsLoadingMore(false);
        return;
      }

      lastCreatedAtRef.current = postsData[postsData.length - 1].created_at;
      setHasMore(postsData.length === POSTS_PER_PAGE);

      // Get unique user IDs
      const userIds = [...new Set(postsData.map(p => p.user_id))];
      
      // Fetch profiles with nickname
      const { data: profilesData } = await supabase
        .from('profiles')
        .select('user_id, name, avatar_url, subflow_nickname')
        .in('user_id', userIds);

      const profilesMap = new Map(
        (profilesData || []).map(p => [p.user_id, p])
      );

      // Fetch all reactions
      const postIds = postsData.map(p => p.id);
      const { data: reactionsData } = await supabase
        .from('subflow_reactions')
        .select('*')
        .in('post_id', postIds);

      // Fetch comments count
      const { data: commentsData } = await supabase
        .from('subflow_comments')
        .select('post_id')
        .in('post_id', postIds);

      // Process reactions
      const reactionsMap = new Map<string, { counts: Record<string, number>; userReactions: string[] }>();
      postIds.forEach(id => {
        reactionsMap.set(id, { counts: {}, userReactions: [] });
      });

      (reactionsData || []).forEach(r => {
        const postReactions = reactionsMap.get(r.post_id);
        if (postReactions) {
          postReactions.counts[r.reaction] = (postReactions.counts[r.reaction] || 0) + 1;
          if (r.user_id === currentUserId) {
            postReactions.userReactions.push(r.reaction);
          }
        }
      });

      // Count comments per post
      const commentsCountMap = new Map<string, number>();
      (commentsData || []).forEach(c => {
        commentsCountMap.set(c.post_id, (commentsCountMap.get(c.post_id) || 0) + 1);
      });

      // Build posts with all data
      const enrichedPosts: Post[] = postsData.map(post => {
        const profile = profilesMap.get(post.user_id);
        const reactions = reactionsMap.get(post.id) || { counts: {}, userReactions: [] };
        
        // Use subflow_nickname if available, otherwise use name
        const displayName = profile?.subflow_nickname || profile?.name || 'Пользователь';
        
        return {
          id: post.id,
          user_id: post.user_id,
          content: post.content,
          image_url: post.image_url,
          image_urls: (post as any).image_urls || [],
          shop_id: post.shop_id,
          shop_name: post.shop_name,
          created_at: post.created_at,
          author_name: displayName,
          author_avatar: profile?.avatar_url || null,
          reactions: reactions.counts,
          user_reactions: reactions.userReactions,
          comments_count: commentsCountMap.get(post.id) || 0,
        };
      });

      // Prefetch stories for all users in this batch
      const postUserIds = [...new Set(enrichedPosts.map(p => p.user_id))];
      prefetchStoriesForUsers(postUserIds);

      if (isInitial) {
        setPosts(enrichedPosts);
      } else {
        setPosts(prev => [...prev, ...enrichedPosts]);
      }
    } catch (error) {
      console.error('Error fetching posts:', error);
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  }, [currentUserId, shopFilter]);

  const loadMore = useCallback(() => {
    if (!isLoadingMore && hasMore) {
      fetchPosts(false);
    }
  }, [fetchPosts, isLoadingMore, hasMore]);

  const { loadMoreRef } = useInfiniteScroll({
    onLoadMore: loadMore,
    hasMore,
    isLoading: isLoadingMore,
  });

  // Initial fetch and refresh
  useEffect(() => {
    fetchPosts(true);
  }, [refreshTrigger, currentUserId, shopFilter]);

  // Fetch highlighted post if not in feed
  useEffect(() => {
    if (!highlightPostId) return;
    const exists = posts.some(p => p.id === highlightPostId);
    if (exists) return;

    // Fetch the specific post
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
        id: postData.id,
        user_id: postData.user_id,
        content: postData.content,
        image_url: postData.image_url,
        image_urls: (postData as any).image_urls || [],
        shop_id: postData.shop_id,
        shop_name: postData.shop_name,
        created_at: postData.created_at,
        author_name: profile?.subflow_nickname || profile?.name || 'Пользователь',
        author_avatar: profile?.avatar_url || null,
        reactions: counts,
        user_reactions: userReactions,
        comments_count: commentsData?.length || 0,
      };
      setPosts(prev => [enriched, ...prev]);
    })();
  }, [highlightPostId]);

  // Subscribe to realtime updates - always refresh on new posts
  useEffect(() => {
    const channel = supabase
      .channel('subflow-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'subflow_posts' }, (payload) => {
        // Immediately add new post to the feed
        const newPost = payload.new as any;
        
        // Fetch author info for the new post (including nickname)
        supabase
          .from('profiles')
          .select('user_id, name, avatar_url, subflow_nickname')
          .eq('user_id', newPost.user_id)
          .single()
          .then(({ data: profile }) => {
            const displayName = profile?.subflow_nickname || profile?.name || 'Пользователь';
            const enrichedPost: Post = {
              id: newPost.id,
              user_id: newPost.user_id,
              content: newPost.content,
              image_url: newPost.image_url,
              image_urls: newPost.image_urls || [],
              shop_id: newPost.shop_id,
              shop_name: newPost.shop_name,
              created_at: newPost.created_at,
              author_name: displayName,
              author_avatar: profile?.avatar_url || null,
              reactions: {},
              user_reactions: [],
              comments_count: 0,
            };
            
            // Add to top of feed if it matches current filter
            if (!shopFilter || newPost.shop_id === shopFilter) {
              setPosts(prev => [enrichedPost, ...prev]);
            }
          });
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'subflow_posts' }, (payload) => {
        // Remove deleted post from feed
        const deletedId = payload.old.id;
        setPosts(prev => prev.filter(p => p.id !== deletedId));
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'subflow_reactions' }, () => {
        // Silently update reactions - could implement optimistic updates here
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUserId, shopFilter]);

  if (isLoading) {
    return <SubFlowPostSkeleton count={4} />;
  }

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

  return (
    <div className="space-y-4">
      {posts.map((post, index) => (
        <SubFlowPost
          key={post.id}
          post={post}
          currentUserId={currentUserId}
          onUpdate={() => fetchPosts(true)}
          animationDelay={index < 10 ? index * 0.05 : 0}
          hasActiveSubscription={hasActiveSubscription}
        />
      ))}
      
      {/* Infinite scroll trigger */}
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
