import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface NotificationRequest {
  type: 'activated' | 'low_balance';
  userId: string;
  cupsCount: number;
  daysCount: number;
}

/**
 * Extracts Telegram ID from phone field
 * Format: +telegram_123456789
 */
function extractTelegramId(phone: string): string | null {
  const match = phone.match(/^\+telegram_(\d+)$/);
  return match ? match[1] : null;
}

/**
 * Sends a message via Telegram Bot API
 */
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
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body: NotificationRequest = await req.json();
    const { type, userId, cupsCount, daysCount } = body;

    console.log('Processing notification:', { type, userId, cupsCount, daysCount });

    // Validate required fields
    if (!type || !userId || cupsCount === undefined || daysCount === undefined) {
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

    // Get user's phone from profiles
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

    // Check if user is a Telegram user
    const telegramId = extractTelegramId(profile.phone);
    
    if (!telegramId) {
      // Not a Telegram user, skip notification silently
      console.log('User is not a Telegram user, skipping notification:', profile.phone);
      return new Response(
        JSON.stringify({ success: true, skipped: true, reason: 'Not a Telegram user' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Build message based on type
    let message: string;
    
    if (type === 'activated') {
      message = `🎉 Подписка активирована ☕\nБаланс: ${cupsCount} кофе · срок: ${daysCount} дней. Наслаждайтесь😌`;
    } else if (type === 'low_balance') {
      message = `❗Подписка на исходе❗\n\nОсталось ${cupsCount} кофе на ${daysCount} дней 🥹\n\nПродлевайте подписку легко в приложении 🙂`;
    } else {
      return new Response(
        JSON.stringify({ error: 'Invalid notification type' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Send notification
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
