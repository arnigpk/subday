import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    let workerEnv: Record<string, string> = {};
    try { workerEnv = JSON.parse(req.headers.get('x-worker-env') || '{}'); } catch { /* ignore */ }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || workerEnv['SUPABASE_URL'];
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || workerEnv['SUPABASE_SERVICE_ROLE_KEY'];
    const supabaseClient = createClient(supabaseUrl!, supabaseKey!);

    // Авторизация ОБЯЗАТЕЛЬНА и проверяется ДО любых действий. Раньше заявка
    // сохранялась только при наличии пользователя, а уведомление в Telegram
    // уходило в любом случае — то есть кто угодно мог слать админу сообщения
    // (и с пустым телом они приходили как «Кофейня: undefined»).
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Требуется авторизация' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const { data: { user } } = await supabaseClient.auth.getUser(authHeader.replace('Bearer ', ''));
    if (!user) {
      return new Response(JSON.stringify({ error: 'Требуется авторизация' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Заявку на рекламу может оставить только владелец кофейни.
    const { data: roleData } = await supabaseClient
      .from('user_roles')
      .select('shop_id')
      .eq('user_id', user.id)
      .eq('role', 'partner')
      .maybeSingle();
    if (!roleData) {
      return new Response(JSON.stringify({ error: 'Доступно только владельцу кофейни' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const shopNameRaw = typeof body.shopName === 'string' ? body.shopName.trim() : '';
    const shopName = shopNameRaw || 'Не указано';
    const time = typeof body.time === 'string' && body.time.trim()
      ? body.time.trim()
      : new Date().toLocaleString('ru-RU', { timeZone: 'Asia/Aqtau' });
    const userId = user.id;
    const shopId = roleData.shop_id || null;

    await supabaseClient.from('ad_requests').insert({
      shop_name: shopName,
      shop_id: shopId,
      partner_user_id: userId,
      status: 'pending',
    });

    // Send Telegram notification
    const botToken = Deno.env.get('NOTIFICATION_BOT_TOKEN') || workerEnv['NOTIFICATION_BOT_TOKEN'];
    const chatId = Deno.env.get('NOTIFICATION_CHAT_ID') || workerEnv['NOTIFICATION_CHAT_ID'];

    if (botToken && chatId) {
      const message = `📢 *Заявка на рекламу*\n\n☕ Кофейня: *${shopName}*\n🕐 Время: ${time}`;
      await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: message,
          parse_mode: 'Markdown',
        }),
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error sending ad request notification:', error);
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
