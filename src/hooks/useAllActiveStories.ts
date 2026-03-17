import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface StoryItem {
  id: string;
  user_id: string;
  image_url: string;
  created_at: string;
  expires_at: string;
}

export interface StoryUser {
  userId: string;
  name: string;
  avatar: string | null;
  stories: StoryItem[];
}

export function useAllActiveStories(currentUserId: string | null) {
  const [users, setUsers] = useState<StoryUser[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    const { data, error } = await supabase
      .from('stories')
      .select('id, user_id, image_url, created_at, expires_at')
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: true });

    if (error || !data) {
      setUsers([]);
      setLoading(false);
      return;
    }

    // Get unique user ids
    const userIds = [...new Set(data.map(s => s.user_id))];

    // Fetch profiles
    const { data: profiles } = await supabase
      .from('profiles')
      .select('user_id, name, avatar_url')
      .in('user_id', userIds);

    const profileMap = new Map(
      (profiles || []).map(p => [p.user_id, { name: p.name || 'Пользователь', avatar: p.avatar_url }])
    );

    // Group by user, current user first
    const grouped = new Map<string, StoryUser>();
    for (const s of data) {
      if (!grouped.has(s.user_id)) {
        const profile = profileMap.get(s.user_id);
        grouped.set(s.user_id, {
          userId: s.user_id,
          name: profile?.name || 'Пользователь',
          avatar: profile?.avatar || null,
          stories: [],
        });
      }
      grouped.get(s.user_id)!.stories.push(s);
    }

    const result = Array.from(grouped.values());
    // Put current user first
    if (currentUserId) {
      const idx = result.findIndex(u => u.userId === currentUserId);
      if (idx > 0) {
        const [me] = result.splice(idx, 1);
        result.unshift(me);
      }
    }

    setUsers(result);
    setLoading(false);
  }, [currentUserId]);

  useEffect(() => { fetch(); }, [fetch]);

  return { users, loading, refresh: fetch };
}
