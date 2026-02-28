import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

async function validateTelegramWebAppData(initData: string, botToken: string): Promise<boolean> {
  try {
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    if (!hash) return false;
    
    params.delete('hash');
    const dataCheckArr = Array.from(params.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value}`);
    const dataCheckString = dataCheckArr.join('\n');
    
    const encoder = new TextEncoder();
    const secretKey = await crypto.subtle.importKey(
      'raw', encoder.encode('WebAppData'),
      { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
    );
    const secretData = await crypto.subtle.sign('HMAC', secretKey, encoder.encode(botToken));
    const dataKey = await crypto.subtle.importKey(
      'raw', secretData,
      { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
    );
    const signature = await crypto.subtle.sign('HMAC', dataKey, encoder.encode(dataCheckString));
    const calculatedHash = Array.from(new Uint8Array(signature))
      .map(b => b.toString(16).padStart(2, '0')).join('');
    
    return calculatedHash === hash;
  } catch (error) {
    console.error('Validation error:', error);
    return false;
  }
}

function sendLoginNotification(displayName: string, telegramUsername: string | null, isNewUser: boolean): void {
  const notificationBotToken = Deno.env.get('NOTIFICATION_BOT_TOKEN');
  const chatId = Deno.env.get('NOTIFICATION_CHAT_ID');
  if (!notificationBotToken || !chatId) return;

  const action = isNewUser ? '🆕 Новая регистрация (Mini App)' : '🔑 Вход (Mini App)';
  const usernameText = telegramUsername ? `@${telegramUsername}` : 'нет username';
  const message = `${action}\n\n👤 Имя: ${displayName}\n📱 Telegram: ${usernameText}\n🕐 ${new Date().toLocaleString('ru-RU', { timeZone: 'Asia/Almaty' })}`;

  fetch(`https://api.telegram.org/bot${notificationBotToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: 'HTML' })
  }).catch(e => console.error('Notification failed:', e));
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // CRITICAL: Handle aborted/truncated requests gracefully
    let body: any;
    try {
      body = await req.json();
    } catch (e) {
      console.error('Body parse error (likely aborted request):', e);
      return new Response(
        JSON.stringify({ error: 'Invalid request body' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { initData } = body;
    if (!initData) {
      return new Response(JSON.stringify({ error: 'initData is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN')!;
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const isValid = await validateTelegramWebAppData(initData, botToken);
    if (!isValid) {
      return new Response(JSON.stringify({ error: 'Invalid initData signature' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const params = new URLSearchParams(initData);
    const userDataStr = params.get('user');
    const authDate = parseInt(params.get('auth_date') || '0', 10);
    
    if (!userDataStr) {
      return new Response(JSON.stringify({ error: 'No user data' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (Math.floor(Date.now() / 1000) - authDate > 86400) {
      return new Response(JSON.stringify({ error: 'Auth data expired' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const userData = JSON.parse(userDataStr);
    const telegramId = userData.id;
    const displayName = [userData.first_name, userData.last_name].filter(Boolean).join(' ') || userData.username || `User ${telegramId}`;
    const username = userData.username || null;

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });
    const email = `tg_${telegramId}@telegram.subday.app`;
    const password = `tg_${telegramId}_${botToken.slice(0, 10)}`;

    // Try to sign in first (fast path for existing users)
    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
      email, password,
    });

    if (signInData?.session) {
      sendLoginNotification(displayName, username, false);
      return new Response(
        JSON.stringify({ session: signInData.session }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // New user registration
    if (signInError?.message?.includes('Invalid login credentials')) {
      const { data: signUpData, error: signUpError } = await supabase.auth.admin.createUser({
        email, password, email_confirm: true,
        user_metadata: { telegram_id: telegramId, telegram_username: username, full_name: displayName },
      });

      if (signUpError) {
        return new Response(JSON.stringify({ error: 'Ошибка создания аккаунта' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      if (signUpData.user) {
        await Promise.all([
          supabase.from('profiles').insert({
            user_id: signUpData.user.id, phone: `+telegram_${telegramId}`,
            name: displayName, avatar_url: null,
          }),
          supabase.from('user_stats').insert({
            user_id: signUpData.user.id, coffee_remaining: 0, coffee_total: 0,
            drinks_remaining: 0, drinks_total: 0, current_streak: 0,
            max_streak: 0, total_cups: 0, bonus_points: 0,
          }),
        ]);
      }

      const { data: newSignInData, error: newSignInError } = await supabase.auth.signInWithPassword({
        email, password,
      });

      if (newSignInError || !newSignInData.session) {
        return new Response(JSON.stringify({ error: 'Ошибка входа после регистрации' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      sendLoginNotification(displayName, username, true);

      return new Response(
        JSON.stringify({ session: newSignInData.session }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(JSON.stringify({ error: 'Ошибка входа' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error('Mini app auth error:', error);
    return new Response(JSON.stringify({ error: 'Внутренняя ошибка сервера' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
