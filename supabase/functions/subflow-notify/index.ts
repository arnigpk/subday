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

// Default milestones if no template is configured
const DEFAULT_MILESTONES: Record<string, number[]> = {
  reaction: [3, 5, 10, 20, 50, 100, 200, 500],
  comment: [2, 5, 10, 20, 50, 100, 200, 500],
  follow: [2, 5, 10, 20, 50, 100, 200, 500],
};

// Map notification type to trigger_type in auto_notification_templates
const TRIGGER_TYPE_MAP: Record<string, string> = {
  reaction: 'subflow_reaction',
  comment: 'subflow_comment',
  follow: 'subflow_follow',
  new_post: 'subflow_new_post',
};

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
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }

    const body: NotifyRequest = await req.json();
    const { type, postId, actorId, reaction, targetUserId } = body;

    // Load template config from auto_notification_templates
    const triggerType = TRIGGER_TYPE_MAP[type];
    const template = await getTemplate(supabase, triggerType);

    // If template exists but is disabled, skip
    if (template && !template.is_active) {
      return jsonResponse({ ok: true, skipped: true, reason: 'template_disabled' });
    }

    const milestones = (template?.trigger_config as any)?.milestones || DEFAULT_MILESTONES[type];
    const messageTemplate = template?.message_template || null;
    const channel = template?.channel || 'both';

    // Get actor profile
    const { data: actorProfile } = await supabase
      .from('profiles')
      .select('name, subflow_nickname, phone')
      .eq('user_id', actorId)
      .single();

    const actorName = actorProfile?.subflow_nickname || actorProfile?.name || 'Пользователь';

    if (type === 'reaction') {
      if (!postId) return jsonResponse({ ok: true, skipped: true });

      const { data: post } = await supabase
        .from('subflow_posts')
        .select('user_id, content')
        .eq('id', postId)
        .single();

      if (!post || post.user_id === actorId) {
        return jsonResponse({ ok: true, skipped: true });
      }

      // Count total reactions on this post
      const { count: reactionCount } = await supabase
        .from('subflow_reactions')
        .select('*', { count: 'exact', head: true })
        .eq('post_id', postId);

      const totalReactions = reactionCount || 0;

      if (milestones && !milestones.includes(totalReactions)) {
        return jsonResponse({ ok: true, skipped: true, reason: 'not_milestone', count: totalReactions });
      }

      const contentPreview = post.content.substring(0, 50) + (post.content.length > 50 ? '...' : '');

      await supabase.from('subflow_notifications').insert({
        user_id: post.user_id,
        actor_id: actorId,
        type: 'reaction',
        post_id: postId,
        reaction: reaction || null,
      });

      const message = renderTemplate(messageTemplate || '🔥 Уже {{count}} реакций на ваш пост!\n«{{preview}}»', {
        count: String(totalReactions),
        actor_name: actorName,
        preview: contentPreview,
      });

      await sendNotification(supabase, telegramBotToken, post.user_id, message, channel);

    } else if (type === 'new_post') {
      if (!postId) return jsonResponse({ ok: true, skipped: true });

      const { data: followers } = await supabase
        .from('subflow_follows')
        .select('follower_id')
        .eq('following_id', actorId);

      if (!followers || followers.length === 0) {
        return jsonResponse({ ok: true, notified: 0 });
      }

      const { data: post } = await supabase
        .from('subflow_posts')
        .select('content')
        .eq('id', postId)
        .single();

      const contentPreview = post ? post.content.substring(0, 50) + (post.content.length > 50 ? '...' : '') : '';

      const notifications = followers.map(f => ({
        user_id: f.follower_id,
        actor_id: actorId,
        type: 'new_post',
        post_id: postId,
      }));

      await supabase.from('subflow_notifications').insert(notifications);

      const message = renderTemplate(messageTemplate || '📝 {{actor_name}} опубликовал(а) новый пост:\n«{{preview}}»', {
        count: String(followers.length),
        actor_name: actorName,
        preview: contentPreview,
      });

      const promises = followers.map(f =>
        sendNotification(supabase, telegramBotToken, f.follower_id, message, channel)
          .catch(err => console.error('Notify error for follower:', err))
      );
      await Promise.allSettled(promises);

      return jsonResponse({ ok: true, notified: followers.length });

    } else if (type === 'comment') {
      if (!postId) return jsonResponse({ ok: true, skipped: true });

      const { data: post } = await supabase
        .from('subflow_posts')
        .select('user_id, content')
        .eq('id', postId)
        .single();

      if (!post || post.user_id === actorId) {
        return jsonResponse({ ok: true, skipped: true });
      }

      const { count: commentCount } = await supabase
        .from('subflow_comments')
        .select('*', { count: 'exact', head: true })
        .eq('post_id', postId);

      const totalComments = commentCount || 0;

      if (milestones && !milestones.includes(totalComments)) {
        return jsonResponse({ ok: true, skipped: true, reason: 'not_milestone', count: totalComments });
      }

      const contentPreview = post.content.substring(0, 50) + (post.content.length > 50 ? '...' : '');

      await supabase.from('subflow_notifications').insert({
        user_id: post.user_id,
        actor_id: actorId,
        type: 'comment',
        post_id: postId,
      });

      const message = renderTemplate(messageTemplate || '💬 Уже {{count}} комментариев к вашему посту:\n«{{preview}}»', {
        count: String(totalComments),
        actor_name: actorName,
        preview: contentPreview,
      });

      await sendNotification(supabase, telegramBotToken, post.user_id, message, channel);

    } else if (type === 'follow') {
      if (!targetUserId || targetUserId === actorId) {
        return jsonResponse({ ok: true, skipped: true });
      }

      const { count: followerCount } = await supabase
        .from('subflow_follows')
        .select('*', { count: 'exact', head: true })
        .eq('following_id', targetUserId);

      const totalFollowers = followerCount || 0;

      if (milestones && !milestones.includes(totalFollowers)) {
        return jsonResponse({ ok: true, skipped: true, reason: 'not_milestone', count: totalFollowers });
      }

      await supabase.from('subflow_notifications').insert({
        user_id: targetUserId,
        actor_id: actorId,
        type: 'follow',
      });

      const message = renderTemplate(messageTemplate || '👥 У вас уже {{count}} подписчиков! {{actor_name}} подписался на вас.', {
        count: String(totalFollowers),
        actor_name: actorName,
        preview: '',
      });

      await sendNotification(supabase, telegramBotToken, targetUserId, message, channel);
    }

    return jsonResponse({ ok: true });

  } catch (err) {
    console.error('subflow-notify error:', err);
    return jsonResponse({ error: err instanceof Error ? err.message : 'Unknown error' }, 500);
  }
});

// --- Helper functions ---

function jsonResponse(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function renderTemplate(template: string, vars: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
  }
  return result;
}

async function getTemplate(supabase: any, triggerType: string) {
  const { data } = await supabase
    .from('auto_notification_templates')
    .select('*')
    .eq('trigger_type', triggerType)
    .limit(1)
    .maybeSingle();
  return data;
}

async function sendNotification(
  supabase: any,
  botToken: string,
  userId: string,
  message: string,
  channel: string,
) {
  const tasks: Promise<void>[] = [];

  if (channel === 'telegram' || channel === 'both') {
    tasks.push(sendTelegramNotification(supabase, botToken, userId, message));
  }

  if (channel === 'push' || channel === 'both') {
    tasks.push(sendPushNotification(supabase, message));
  }

  await Promise.allSettled(tasks);
}

async function sendTelegramNotification(
  supabase: any,
  botToken: string,
  userId: string,
  message: string,
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

async function sendPushNotification(supabase: any, message: string) {
  try {
    await supabase.from('push_notifications').insert({
      title: '#subFlow',
      message,
    });
  } catch (err) {
    console.error('Failed to insert push notification:', err);
  }
}
