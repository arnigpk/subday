import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface StoryItem {
  id: string;
  user_id: string;
  image_url: string;
  created_at: string;
  expires_at: string;
  media_type?: string;
}

export interface StoryUser {
  userId: string;
  name: string;
  avatar: string | null;
  stories: StoryItem[];
  /** Timestamp of the latest story — used for sorting */
  latestStoryAt: string;
}

export function useAllActiveStories(currentUserId: string | null) {
  const [users, setUsers] = useState<StoryUser[]>([]);
  const [viewedStoryIds, setViewedStoryIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    const { data, error } = await supabase
      .from('stories')
      .select('id, user_id, image_url, created_at, expires_at, media_type')
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: true });

    if (error || !data) {
      setUsers([]);
      setLoading(false);
      return;
    }

    const userIds = [...new Set(data.map(s => s.user_id))];

    const [profilesRes, viewedRes] = await Promise.all([
      supabase.from('public_profiles').select('user_id, name, avatar_url').in('user_id', userIds),
      currentUserId
        ? supabase.from('story_views').select('story_id').eq('user_id', currentUserId)
        : Promise.resolve({ data: [] as { story_id: string }[] }),
    ]);

    const profileMap = new Map(
      (profilesRes.data || []).map(p => [p.user_id, { name: p.name || 'Пользователь', avatar: p.avatar_url }])
    );

    const viewed = new Set((viewedRes.data || []).map(v => v.story_id));
    setViewedStoryIds(viewed);

    // Group by user
    const grouped = new Map<string, StoryUser>();
    for (const s of data) {
      if (!grouped.has(s.user_id)) {
        const profile = profileMap.get(s.user_id);
        grouped.set(s.user_id, {
          userId: s.user_id,
          name: profile?.name || 'Пользователь',
          avatar: profile?.avatar || null,
          stories: [],
          latestStoryAt: s.created_at,
        });
      }
      const user = grouped.get(s.user_id)!;
      user.stories.push({
        ...s,
        media_type: (s as any).media_type || 'image',
      });
      // Track the latest story timestamp
      if (s.created_at > user.latestStoryAt) {
        user.latestStoryAt = s.created_at;
      }
    }

    // Sort: current user first, then by latest story time (newest first)
    const result = Array.from(grouped.values());
    result.sort((a, b) => {
      // Current user always first
      if (currentUserId) {
        if (a.userId === currentUserId) return -1;
        if (b.userId === currentUserId) return 1;
      }
      // Then sort by latest story descending (most recent first)
      return new Date(b.latestStoryAt).getTime() - new Date(a.latestStoryAt).getTime();
    });

    setUsers(result);
    setLoading(false);
  }, [currentUserId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Realtime
  useEffect(() => {
    const channel = supabase
      .channel(`stories-realtime-${Math.random().toString(36).slice(2)}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'stories' },
        () => { fetchData(); }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [fetchData]);

  const isUserFullyViewed = useCallback((user: StoryUser) => {
    return user.stories.every(s => viewedStoryIds.has(s.id));
  }, [viewedStoryIds]);

  return { users, loading, refresh: fetchData, viewedStoryIds, isUserFullyViewed };
}
