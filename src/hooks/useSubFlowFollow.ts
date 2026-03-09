import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export function useSubFlowFollow(currentUserId: string | null, targetUserId: string) {
  const [isFollowing, setIsFollowing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!currentUserId || currentUserId === targetUserId) return;

    supabase
      .from('subflow_follows')
      .select('id')
      .eq('follower_id', currentUserId)
      .eq('following_id', targetUserId)
      .maybeSingle()
      .then(({ data }) => {
        setIsFollowing(!!data);
      });
  }, [currentUserId, targetUserId]);

  const toggleFollow = useCallback(async () => {
    if (!currentUserId || currentUserId === targetUserId || isLoading) return;

    setIsLoading(true);
    try {
      if (isFollowing) {
        await supabase
          .from('subflow_follows')
          .delete()
          .eq('follower_id', currentUserId)
          .eq('following_id', targetUserId);
        setIsFollowing(false);
      } else {
        await supabase
          .from('subflow_follows')
          .insert({ follower_id: currentUserId, following_id: targetUserId });
        setIsFollowing(true);
      }
    } catch (err) {
      console.error('Follow toggle error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [currentUserId, targetUserId, isFollowing, isLoading]);

  return { isFollowing, isLoading, toggleFollow };
}
