import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { SubFlowPost } from './SubFlowPost';
import { Loader2 } from 'lucide-react';

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

interface SubFlowFeedProps {
  refreshTrigger: number;
  currentUserId: string | null;
}

export function SubFlowFeed({ refreshTrigger, currentUserId }: SubFlowFeedProps) {
  const [posts, setPosts] = useState<Post[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchPosts = async () => {
    try {
      // Fetch posts
      const { data: postsData, error: postsError } = await supabase
        .from('subflow_posts')
        .select('*')
        .order('created_at', { ascending: false });

      if (postsError) throw postsError;

      if (!postsData || postsData.length === 0) {
        setPosts([]);
        setIsLoading(false);
        return;
      }

      // Get unique user IDs
      const userIds = [...new Set(postsData.map(p => p.user_id))];
      
      // Fetch profiles
      const { data: profilesData } = await supabase
        .from('profiles')
        .select('user_id, name, avatar_url')
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
        
        return {
          id: post.id,
          user_id: post.user_id,
          content: post.content,
          image_url: post.image_url,
          shop_id: post.shop_id,
          shop_name: post.shop_name,
          created_at: post.created_at,
          author_name: profile?.name || 'Пользователь',
          author_avatar: profile?.avatar_url || null,
          reactions: reactions.counts,
          user_reactions: reactions.userReactions,
          comments_count: commentsCountMap.get(post.id) || 0,
        };
      });

      setPosts(enrichedPosts);
    } catch (error) {
      console.error('Error fetching posts:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchPosts();
  }, [refreshTrigger, currentUserId]);

  // Subscribe to realtime updates
  useEffect(() => {
    const channel = supabase
      .channel('subflow-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'subflow_posts' }, () => {
        fetchPosts();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'subflow_reactions' }, () => {
        fetchPosts();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUserId]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
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
          onUpdate={fetchPosts}
          animationDelay={index * 0.05}
        />
      ))}
    </div>
  );
}
