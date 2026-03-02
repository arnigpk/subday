import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

interface NotificationRequest {
  type: 'activated' | 'low_balance' | 'expiring_soon';
  userId: string;
  cupsCount?: number;
  daysCount?: number;
  subscriptionName?: string;
  drinkType?: 'coffee' | 'drinks';
}

function extractTelegramId(phone: string): string | null {
  const match = phone.match(/^\+telegram_(\d+)$/);
  return match ? match[1] : null;
}

async function sendTelegramMessage(telegramId: string, message: string, botToken: string): Promise<boolean> {
  try {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: telegramId,
        text: message,
        parse_mode: 'HTML',
      }),
    });

    const result = await response.json();
    
    if (!result.ok) {
      console.error('Telegram API error:', result);
      return false;
    }
    
    console.log('Telegram message sent successfully to:', telegramId);
    return true;
  } catch (error) {
    console.error('Error sending Telegram message:', error);
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body: NotificationRequest = await req.json();
    const { type, userId, cupsCount, daysCount, subscriptionName, drinkType } = body;

    console.log('Processing notification:', { type, userId, cupsCount, daysCount, subscriptionName });

    if (!type || !userId) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const telegramBotToken = Deno.env.get('TELEGRAM_BOT_TOKEN');

    if (!telegramBotToken) {
      console.error('TELEGRAM_BOT_TOKEN not configured');
      return new Response(
        JSON.stringify({ success: false, error: 'Bot token not configured' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('phone, name')
      .eq('user_id', userId)
      .maybeSingle();

    if (profileError || !profile) {
      console.error('Profile not found:', profileError);
      return new Response(
        JSON.stringify({ success: false, error: 'User not found' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const telegramId = extractTelegramId(profile.phone);
    
    if (!telegramId) {
      console.log('User is not a Telegram user, skipping notification:', profile.phone);
      return new Response(
        JSON.stringify({ success: true, skipped: true, reason: 'Not a Telegram user' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let message: string;
    const subName = subscriptionName || 'Подписка';
    
    if (type === 'activated') {
      message = `🎉 Подписка ${subName} активирована 🚀 Наслаждайтесь😌`;
    } else if (type === 'low_balance') {
      const count = cupsCount || 5;
      const unitWord = drinkType === 'drinks'
        ? (count === 2 ? 'ланча' : 'ланчей')
        : (count === 2 ? 'напитка' : 'напитков');
      message = `⚠️ У вас осталось ${count} ${unitWord} по подписке ${subName}`;
    } else if (type === 'expiring_soon') {
      const days = daysCount || 5;
      const daysWord = days === 2 ? 'дня' : 'дней';
      message = `⚠️ У вас осталось ${days} ${daysWord} до окончания подписки ${subName}`;
    } else {
      return new Response(
        JSON.stringify({ error: 'Invalid notification type' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const sent = await sendTelegramMessage(telegramId, message, telegramBotToken);

    return new Response(
      JSON.stringify({ success: sent, telegramId, type }),
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
