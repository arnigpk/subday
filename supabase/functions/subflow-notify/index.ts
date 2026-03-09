import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

interface NotifyRequest {
  type: 'reaction' | 'new_post' | 'comment' | 'follow';
  postId?: string;
  actorId: string;
  reaction?: string;
  targetUserId?: string;
}

// Milestone thresholds for batched notifications
const REACTION_MILESTONES = [3, 5, 10, 20, 50, 100, 200, 500];
const COMMENT_MILESTONES = [2, 5, 10, 20, 50, 100, 200, 500];
const FOLLOWER_MILESTONES = [2, 5, 10, 20, 50, 100, 200, 500];

function isMilestone(count: number, milestones: number[]): boolean {
  return milestones.includes(count);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const telegramBotToken = Deno.env.get('TELEGRAM_BOT_TOKEN')!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Verify caller
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body: NotifyRequest = await req.json();
    const { type, postId, actorId, reaction, targetUserId } = body;

    // Get actor profile
    const { data: actorProfile } = await supabase
      .from('profiles')
      .select('name, subflow_nickname, phone')
      .eq('user_id', actorId)
      .single();

    const actorName = actorProfile?.subflow_nickname || actorProfile?.name || 'Пользователь';

    if (type === 'reaction') {
      if (!postId) return jsonOk({ ok: true, skipped: true });

      // Get post author
      const { data: post } = await supabase
        .from('subflow_posts')
        .select('user_id, content')
        .eq('id', postId)
        .single();

      if (!post || post.user_id === actorId) {
        return jsonOk({ ok: true, skipped: true });
      }

      // Count total reactions on this post
      const { count: reactionCount } = await supabase
        .from('subflow_reactions')
        .select('*', { count: 'exact', head: true })
        .eq('post_id', postId);

      const totalReactions = reactionCount || 0;

      // Only notify at milestones (3, 5, 10, 20, ...)
      if (!isMilestone(totalReactions, REACTION_MILESTONES)) {
        return jsonOk({ ok: true, skipped: true, reason: 'not_milestone', count: totalReactions });
      }

      const contentPreview = post.content.substring(0, 50) + (post.content.length > 50 ? '...' : '');

      // Create notification
      await supabase.from('subflow_notifications').insert({
        user_id: post.user_id,
        actor_id: actorId,
        type: 'reaction',
        post_id: postId,
        reaction: reaction || null,
      });

      // Send Telegram
      await sendTelegramNotification(
        supabase, telegramBotToken, post.user_id,
        `🔥 Уже ${totalReactions} реакций на ваш пост!\n«${contentPreview}»`
      );

    } else if (type === 'new_post') {
      if (!postId) return jsonOk({ ok: true, skipped: true });

      // Get all followers of the actor
      const { data: followers } = await supabase
        .from('subflow_follows')
        .select('follower_id')
        .eq('following_id', actorId);

      if (!followers || followers.length === 0) {
        return jsonOk({ ok: true, notified: 0 });
      }

      // Get post content for preview
      const { data: post } = await supabase
        .from('subflow_posts')
        .select('content')
        .eq('id', postId)
        .single();

      const contentPreview = post ? post.content.substring(0, 50) + (post.content.length > 50 ? '...' : '') : '';

      // Create notifications for all followers
      const notifications = followers.map(f => ({
        user_id: f.follower_id,
        actor_id: actorId,
        type: 'new_post',
        post_id: postId,
      }));

      await supabase.from('subflow_notifications').insert(notifications);

      // Send Telegram to all followers
      const telegramPromises = followers.map(f =>
        sendTelegramNotification(
          supabase, telegramBotToken, f.follower_id,
          `📝 ${actorName} опубликовал(а) новый пост:\n«${contentPreview}»`
        ).catch(err => console.error('Telegram error for follower:', err))
      );

      await Promise.allSettled(telegramPromises);

      return jsonOk({ ok: true, notified: followers.length });

    } else if (type === 'comment') {
      if (!postId) return jsonOk({ ok: true, skipped: true });

      // Get post author
      const { data: post } = await supabase
        .from('subflow_posts')
        .select('user_id, content')
        .eq('id', postId)
        .single();

      if (!post || post.user_id === actorId) {
        return jsonOk({ ok: true, skipped: true });
      }

      // Count total comments on this post
      const { count: commentCount } = await supabase
        .from('subflow_comments')
        .select('*', { count: 'exact', head: true })
        .eq('post_id', postId);

      const totalComments = commentCount || 0;

      // Only notify at milestones (2, 5, 10, 20, ...)
      if (!isMilestone(totalComments, COMMENT_MILESTONES)) {
        return jsonOk({ ok: true, skipped: true, reason: 'not_milestone', count: totalComments });
      }

      const contentPreview = post.content.substring(0, 50) + (post.content.length > 50 ? '...' : '');

      await supabase.from('subflow_notifications').insert({
        user_id: post.user_id,
        actor_id: actorId,
        type: 'comment',
        post_id: postId,
      });

      await sendTelegramNotification(
        supabase, telegramBotToken, post.user_id,
        `💬 Уже ${totalComments} комментариев к вашему посту:\n«${contentPreview}»`
      );

    } else if (type === 'follow') {
      if (!targetUserId || targetUserId === actorId) {
        return jsonOk({ ok: true, skipped: true });
      }

      // Count total followers of target user
      const { count: followerCount } = await supabase
        .from('subflow_follows')
        .select('*', { count: 'exact', head: true })
        .eq('following_id', targetUserId);

      const totalFollowers = followerCount || 0;

      // Only notify at milestones (2, 5, 10, 20, ...)
      if (!isMilestone(totalFollowers, FOLLOWER_MILESTONES)) {
        return jsonOk({ ok: true, skipped: true, reason: 'not_milestone', count: totalFollowers });
      }

      await supabase.from('subflow_notifications').insert({
        user_id: targetUserId,
        actor_id: actorId,
        type: 'follow',
      });

      await sendTelegramNotification(
        supabase, telegramBotToken, targetUserId,
        `👥 У вас уже ${totalFollowers} подписчиков! ${actorName} подписался на вас.`
      );
    }

    return jsonOk({ ok: true });

  } catch (err) {
    console.error('subflow-notify error:', err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : 'Unknown error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

function jsonOk(data: any) {
  return new Response(JSON.stringify(data), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function sendTelegramNotification(
  supabase: any,
  botToken: string,
  userId: string,
  message: string
) {
  const { data: profile } = await supabase
    .from('profiles')
    .select('phone')
    .eq('user_id', userId)
    .single();

  if (!profile?.phone?.startsWith('+telegram_')) return;

  const telegramId = profile.phone.replace('+telegram_', '');

  try {
    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: telegramId,
        text: message,
        parse_mode: 'HTML',
      }),
    });
  } catch (err) {
    console.error('Failed to send telegram:', err);
  }
}
