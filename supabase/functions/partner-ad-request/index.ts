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

    const { shopName, time } = await req.json();

    // Get user from auth header
    const authHeader = req.headers.get('Authorization');
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || workerEnv['SUPABASE_URL'];
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || workerEnv['SUPABASE_SERVICE_ROLE_KEY'];
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') || workerEnv['SUPABASE_ANON_KEY'];
    const supabaseClient = createClient(supabaseUrl!, supabaseKey!);

    let userId: string | null = null;
    let shopId: string | null = null;

    if (authHeader) {
      const anonClient = createClient(supabaseUrl!, supabaseAnonKey!);
      const token = authHeader.replace('Bearer ', '');
      const { data: { user } } = await anonClient.auth.getUser(token);
      if (user) {
        userId = user.id;
        // Get partner's shop_id
        const { data: roleData } = await supabaseClient
          .from('user_roles')
          .select('shop_id')
          .eq('user_id', user.id)
          .eq('role', 'partner')
          .maybeSingle();
        shopId = roleData?.shop_id || null;
      }
    }

    // Save to ad_requests table
    if (userId) {
      await supabaseClient.from('ad_requests').insert({
        shop_name: shopName || 'Не указано',
        shop_id: shopId,
        partner_user_id: userId,
        status: 'pending',
      });
    }

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
