import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface Story {
  id: string;
  user_id: string;
  image_url: string;
  created_at: string;
  expires_at: string;
}

interface UserStories {
  hasStory: boolean;
  stories: Story[];
  lastChecked: number;
}

// Global cache for stories - shared across components
const storiesCache = new Map<string, UserStories>();
const CACHE_TTL = 60000; // 1 minute cache

export function useStoriesCache(userId: string) {
  const [hasStory, setHasStory] = useState(() => {
    const cached = storiesCache.get(userId);
    if (cached && Date.now() - cached.lastChecked < CACHE_TTL) {
      return cached.hasStory;
    }
    return false;
  });
  
  const [stories, setStories] = useState<Story[]>(() => {
    const cached = storiesCache.get(userId);
    if (cached && Date.now() - cached.lastChecked < CACHE_TTL) {
      return cached.stories;
    }
    return [];
  });

  const checkForStories = useCallback(async () => {
    // Check cache first
    const cached = storiesCache.get(userId);
    if (cached && Date.now() - cached.lastChecked < CACHE_TTL) {
      setHasStory(cached.hasStory);
      setStories(cached.stories);
      return;
    }

    const { data, error } = await supabase
      .from('stories')
      .select('id, user_id, image_url, created_at, expires_at')
      .eq('user_id', userId)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: true });

    const result: UserStories = {
      hasStory: !error && data && data.length > 0,
      stories: data || [],
      lastChecked: Date.now()
    };

    storiesCache.set(userId, result);
    setHasStory(result.hasStory);
    setStories(result.stories);
  }, [userId]);

  useEffect(() => {
    checkForStories();
  }, [checkForStories]);

  const invalidateCache = useCallback(() => {
    storiesCache.delete(userId);
    checkForStories();
  }, [userId, checkForStories]);

  return { hasStory, stories, invalidateCache };
}

// Batch fetch stories for multiple users
export async function prefetchStoriesForUsers(userIds: string[]) {
  const uncachedIds = userIds.filter(id => {
    const cached = storiesCache.get(id);
    return !cached || Date.now() - cached.lastChecked >= CACHE_TTL;
  });

  if (uncachedIds.length === 0) return;

  const { data } = await supabase
    .from('stories')
    .select('id, user_id, image_url, created_at, expires_at')
    .in('user_id', uncachedIds)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: true });

  // Group stories by user_id
  const storiesByUser = new Map<string, Story[]>();
  uncachedIds.forEach(id => storiesByUser.set(id, []));
  
  (data || []).forEach(story => {
    const userStories = storiesByUser.get(story.user_id) || [];
    userStories.push(story);
    storiesByUser.set(story.user_id, userStories);
  });

  // Update cache for all users
  storiesByUser.forEach((stories, id) => {
    storiesCache.set(id, {
      hasStory: stories.length > 0,
      stories,
      lastChecked: Date.now()
    });
  });
}
