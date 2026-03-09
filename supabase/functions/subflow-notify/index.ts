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

const TRIGGER_TYPE_MAP: Record<string, string> = {
  reaction: 'subflow_reaction',
  comment: 'subflow_comment',
  follow: 'subflow_follow',
  new_post: 'subflow_new_post',
};

const DEFAULT_COOLDOWN_MINUTES = 60;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const telegramBotToken = Deno.env.get('TELEGRAM_BOT_TOKEN')!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }

    const body: NotifyRequest = await req.json();
    const { type, postId, actorId, reaction, targetUserId } = body;

    const triggerType = TRIGGER_TYPE_MAP[type];
    const template = await getTemplate(supabase, triggerType);

    if (template && !template.is_active) {
      return jsonResponse({ ok: true, skipped: true, reason: 'template_disabled' });
    }

    const cooldownMinutes = (template?.trigger_config as any)?.cooldown_minutes || DEFAULT_COOLDOWN_MINUTES;
    const messageTemplate = template?.message_template || null;
    const channel = template?.channel || 'both';

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

      // Check cooldown — was there a reaction notification for this post recently?
      const cooldownCheck = await checkCooldown(supabase, post.user_id, 'reaction', postId, cooldownMinutes);
      if (!cooldownCheck.shouldSend) {
        return jsonResponse({ ok: true, skipped: true, reason: 'cooldown', nextAt: cooldownCheck.nextAt });
      }

      // Count reactions since last notification (or all if no previous notification)
      const newCount = await countSince(supabase, 'subflow_reactions', 'post_id', postId, cooldownCheck.lastNotifiedAt);

      if (newCount === 0) {
        return jsonResponse({ ok: true, skipped: true, reason: 'no_new' });
      }

      const contentPreview = post.content.substring(0, 50) + (post.content.length > 50 ? '...' : '');

      await supabase.from('subflow_notifications').insert({
        user_id: post.user_id,
        actor_id: actorId,
        type: 'reaction',
        post_id: postId,
        reaction: reaction || null,
      });

      const message = renderTemplate(messageTemplate || '🔥 +{{count}} реакций на ваш пост!\n«{{preview}}»', {
        count: String(newCount),
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

      const cooldownCheck = await checkCooldown(supabase, post.user_id, 'comment', postId, cooldownMinutes);
      if (!cooldownCheck.shouldSend) {
        return jsonResponse({ ok: true, skipped: true, reason: 'cooldown', nextAt: cooldownCheck.nextAt });
      }

      const newCount = await countSince(supabase, 'subflow_comments', 'post_id', postId, cooldownCheck.lastNotifiedAt);

      if (newCount === 0) {
        return jsonResponse({ ok: true, skipped: true, reason: 'no_new' });
      }

      const contentPreview = post.content.substring(0, 50) + (post.content.length > 50 ? '...' : '');

      await supabase.from('subflow_notifications').insert({
        user_id: post.user_id,
        actor_id: actorId,
        type: 'comment',
        post_id: postId,
      });

      const message = renderTemplate(messageTemplate || '💬 +{{count}} комментариев к вашему посту:\n«{{preview}}»', {
        count: String(newCount),
        actor_name: actorName,
        preview: contentPreview,
      });

      await sendNotification(supabase, telegramBotToken, post.user_id, message, channel);

    } else if (type === 'follow') {
      if (!targetUserId || targetUserId === actorId) {
        return jsonResponse({ ok: true, skipped: true });
      }

      const cooldownCheck = await checkCooldown(supabase, targetUserId, 'follow', null, cooldownMinutes);
      if (!cooldownCheck.shouldSend) {
        return jsonResponse({ ok: true, skipped: true, reason: 'cooldown', nextAt: cooldownCheck.nextAt });
      }

      const newCount = await countSince(supabase, 'subflow_follows', 'following_id', targetUserId, cooldownCheck.lastNotifiedAt);

      if (newCount === 0) {
        return jsonResponse({ ok: true, skipped: true, reason: 'no_new' });
      }

      await supabase.from('subflow_notifications').insert({
        user_id: targetUserId,
        actor_id: actorId,
        type: 'follow',
      });

      const message = renderTemplate(messageTemplate || '👥 +{{count}} новых подписчиков! {{actor_name}} подписался на вас.', {
        count: String(newCount),
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

/**
 * Check if we can send a notification based on cooldown.
 * Returns { shouldSend, lastNotifiedAt, nextAt }
 */
async function checkCooldown(
  supabase: any,
  userId: string,
  type: string,
  postId: string | null,
  cooldownMinutes: number,
): Promise<{ shouldSend: boolean; lastNotifiedAt: string | null; nextAt?: string }> {
  let query = supabase
    .from('subflow_notifications')
    .select('created_at')
    .eq('user_id', userId)
    .eq('type', type)
    .order('created_at', { ascending: false })
    .limit(1);

  if (postId) {
    query = query.eq('post_id', postId);
  }

  const { data } = await query;

  if (!data || data.length === 0) {
    return { shouldSend: true, lastNotifiedAt: null };
  }

  const lastNotifiedAt = data[0].created_at;
  const lastTime = new Date(lastNotifiedAt).getTime();
  const now = Date.now();
  const diffMinutes = (now - lastTime) / (1000 * 60);

  if (diffMinutes < cooldownMinutes) {
    const nextAt = new Date(lastTime + cooldownMinutes * 60 * 1000).toISOString();
    return { shouldSend: false, lastNotifiedAt, nextAt };
  }

  return { shouldSend: true, lastNotifiedAt };
}

/**
 * Count new items since the last notification time.
 */
async function countSince(
  supabase: any,
  table: string,
  filterColumn: string,
  filterValue: string,
  sinceTimestamp: string | null,
): Promise<number> {
  let query = supabase
    .from(table)
    .select('*', { count: 'exact', head: true })
    .eq(filterColumn, filterValue);

  if (sinceTimestamp) {
    query = query.gt('created_at', sinceTimestamp);
  }

  const { count } = await query;
  return count || 0;
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
