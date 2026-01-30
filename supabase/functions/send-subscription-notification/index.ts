import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface NotificationRequest {
  type: 'activated' | 'low_balance';
  userId: string;
  cupsCount?: number;
  daysCount?: number;
  remaining?: number;
  daysRemaining?: number;
}

async function sendTelegramMessage(botToken: string, chatId: string, message: string): Promise<boolean> {
  try {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: 'HTML',
      }),
    });

    const result = await response.json();
    if (!result.ok) {
      console.error('Telegram API error:', result);
      return false;
    }
    return true;
  } catch (error) {
    console.error('Failed to send Telegram message:', error);
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const botToken = Deno.env.get('NOTIFICATION_BOT_TOKEN');
    const chatId = Deno.env.get('NOTIFICATION_CHAT_ID');

    if (!botToken || !chatId) {
      console.error('Missing NOTIFICATION_BOT_TOKEN or NOTIFICATION_CHAT_ID');
      return new Response(
        JSON.stringify({ error: 'Notification credentials not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body: NotificationRequest = await req.json();
    const { type, userId, cupsCount, daysCount, remaining, daysRemaining } = body;

    console.log('Processing notification:', { type, userId, cupsCount, daysCount, remaining, daysRemaining });

    // Get user profile
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('name, phone')
      .eq('user_id', userId)
      .maybeSingle();

    if (profileError) {
      console.error('Error fetching profile:', profileError);
    }

    const userName = profile?.name || 'Клиент';
    const userPhone = profile?.phone || 'Не указан';
    const now = new Date().toLocaleString('ru-RU', { timeZone: 'Asia/Oral' });

    let message = '';

    if (type === 'activated') {
      message = `☕ <b>Подписка активирована</b>

👤 Имя: ${userName}
📞 Телефон: ${userPhone}
📦 ${cupsCount} кофе на ${daysCount} дней
🕐 ${now}`;
    } else if (type === 'low_balance') {
      message = `⚠️ <b>Низкий остаток по подписке</b>

👤 Имя: ${userName}
📞 Телефон: ${userPhone}
📦 Осталось ${remaining} кофе на ${daysRemaining} дней
🕐 ${now}`;
    } else {
      return new Response(
        JSON.stringify({ error: 'Invalid notification type' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const success = await sendTelegramMessage(botToken, chatId, message);

    if (!success) {
      return new Response(
        JSON.stringify({ error: 'Failed to send notification' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Notification sent successfully:', { type, userId });

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
