import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

interface NotifyRequest {
  type: 'reaction' | 'new_post' | 'comment';
  postId: string;
  actorId: string;
  reaction?: string;
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

    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: authError } = await authClient.auth.getClaims(token);
    if (authError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body: NotifyRequest = await req.json();
    const { type, postId, actorId, reaction } = body;

    // Get actor profile
    const { data: actorProfile } = await supabase
      .from('profiles')
      .select('name, subflow_nickname, phone')
      .eq('user_id', actorId)
      .single();

    const actorName = actorProfile?.subflow_nickname || actorProfile?.name || 'Пользователь';

    if (type === 'reaction') {
      // Get post author
      const { data: post } = await supabase
        .from('subflow_posts')
        .select('user_id, content')
        .eq('id', postId)
        .single();

      if (!post || post.user_id === actorId) {
        return new Response(JSON.stringify({ ok: true, skipped: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
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

      // Send Telegram to post author
      await sendTelegramNotification(
        supabase, telegramBotToken, post.user_id,
        `${reaction || '💚'} ${actorName} поставил(а) реакцию на ваш пост:\n«${contentPreview}»`
      );

    } else if (type === 'new_post') {
      // Get all followers of the actor
      const { data: followers } = await supabase
        .from('subflow_follows')
        .select('follower_id')
        .eq('following_id', actorId);

      if (!followers || followers.length === 0) {
        return new Response(JSON.stringify({ ok: true, notified: 0 }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
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

      // Send Telegram to all followers (fire-and-forget)
      const telegramPromises = followers.map(f =>
        sendTelegramNotification(
          supabase, telegramBotToken, f.follower_id,
          `📝 ${actorName} опубликовал(а) новый пост:\n«${contentPreview}»`
        ).catch(err => console.error('Telegram error for follower:', err))
      );

      await Promise.allSettled(telegramPromises);

      return new Response(JSON.stringify({ ok: true, notified: followers.length }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });

    } else if (type === 'comment') {
      // Get post author
      const { data: post } = await supabase
        .from('subflow_posts')
        .select('user_id, content')
        .eq('id', postId)
        .single();

      if (!post || post.user_id === actorId) {
        return new Response(JSON.stringify({ ok: true, skipped: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
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
        `💬 ${actorName} прокомментировал(а) ваш пост:\n«${contentPreview}»`
      );
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('subflow-notify error:', err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : 'Unknown error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function sendTelegramNotification(
  supabase: any,
  botToken: string,
  userId: string,
  message: string
) {
  // Get user profile to find telegram ID
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
