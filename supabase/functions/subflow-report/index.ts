import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// UGC-модерация #subFlow: жалоба на контент / блокировка пользователя.
// Уведомляет разработчика (админ-бот) — требование App Store Guideline 1.2.
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    let workerEnv: Record<string, string> = {};
    try { workerEnv = JSON.parse(req.headers.get('x-worker-env') || '{}'); } catch { /* ignore */ }
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || workerEnv['SUPABASE_URL'];
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || workerEnv['SUPABASE_SERVICE_ROLE_KEY'];
    const botToken = Deno.env.get('NOTIFICATION_BOT_TOKEN') || workerEnv['NOTIFICATION_BOT_TOKEN'];
    const chatId = Deno.env.get('NOTIFICATION_CHAT_ID') || workerEnv['NOTIFICATION_CHAT_ID'];
    const supabase = createClient(supabaseUrl!, serviceKey!);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const { data: { user } } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
    if (!user) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const body = await req.json();
    const action: 'report' | 'block' = body.action;
    const targetUserId: string | null = body.targetUserId || null;
    const targetType: string = body.targetType || 'post';
    const targetId: string | null = body.targetId || null;
    const reason: string = (body.reason || '').toString().slice(0, 500);

    if (action === 'block') {
      if (!targetUserId) {
        return new Response(JSON.stringify({ error: 'targetUserId required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      // Блокировка (идемпотентно) — контент сразу пропадает из ленты на клиенте.
      await supabase.from('subflow_blocks').upsert(
        { blocker_id: user.id, blocked_id: targetUserId },
        { onConflict: 'blocker_id,blocked_id' },
      );
      // Блокировка также заводит жалобу в очередь модерации (Apple: уведомить разработчика).
      await supabase.from('subflow_reports').insert({
        reporter_id: user.id, target_type: 'user', target_user_id: targetUserId,
        reason: reason || 'Пользователь заблокирован', status: 'pending',
      });
    } else {
      // Жалоба на пост/комментарий/пользователя.
      await supabase.from('subflow_reports').insert({
        reporter_id: user.id, target_type: targetType, target_id: targetId,
        target_user_id: targetUserId, reason: reason || null, status: 'pending',
      });
    }

    // Уведомление разработчику в админ-бот (fire-and-forget).
    if (botToken && chatId) {
      const title = action === 'block' ? '🚫 Блокировка в #subFlow' : '⚠️ Жалоба в #subFlow';
      const text =
        `${title}\n` +
        `От: <code>${user.id}</code>\n` +
        `Тип: ${targetType}${targetId ? ` (<code>${targetId}</code>)` : ''}\n` +
        (targetUserId ? `Автор: <code>${targetUserId}</code>\n` : '') +
        (reason ? `Причина: ${reason}\n` : '') +
        `Разобрать в течение 24 часов.`;
      fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
      }).catch(() => {});
    }

    return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error('subflow-report error:', err);
    return new Response(JSON.stringify({ error: 'internal' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
