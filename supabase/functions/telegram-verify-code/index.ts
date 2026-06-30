import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

async function sendAdminNotification(
  supabase: any,
  env: Record<string, string>,
  triggerType: string,
  variables: Record<string, string>
): Promise<void> {
  try {
    const { data: template } = await supabase
      .from('auto_notification_templates')
      .select('message_template, is_active')
      .eq('trigger_type', triggerType)
      .eq('is_active', true)
      .maybeSingle();

    if (!template) return;

    const notificationBotToken = Deno.env.get('NOTIFICATION_BOT_TOKEN') || env['NOTIFICATION_BOT_TOKEN'];
    const chatId = Deno.env.get('NOTIFICATION_CHAT_ID') || env['NOTIFICATION_CHAT_ID'];
    if (!notificationBotToken || !chatId) return;

    let message = template.message_template;
    for (const [key, value] of Object.entries(variables)) {
      message = message.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
    }

    fetch(`https://api.telegram.org/bot${notificationBotToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: 'HTML' })
    }).catch(e => console.error('Notification failed:', e));
  } catch (e) {
    console.error('Admin notification error:', e);
  }
}

async function downloadAndUploadAvatar(
  supabase: any, telegramAvatarUrl: string, userId: string
): Promise<string | null> {
  try {
    const response = await fetch(telegramAvatarUrl);
    if (!response.ok) return null;
    const uint8Array = new Uint8Array(await (await response.blob()).arrayBuffer());
    const filePath = `${userId}/avatar.jpg`;
    const { error } = await supabase.storage.from('avatars').upload(filePath, uint8Array, {
      contentType: 'image/jpeg', upsert: true,
    });
    if (error) return null;
    return supabase.storage.from('avatars').getPublicUrl(filePath).data.publicUrl;
  } catch { return null; }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { code } = await req.json();
    
    if (!code || code.length !== 6) {
      return new Response(
        JSON.stringify({ error: 'Введите 6-значный код' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let workerEnv: Record<string, string> = {};
    try { workerEnv = JSON.parse(req.headers.get('x-worker-env') || '{}'); } catch { /* ignore */ }
    const supabaseUrl = (Deno.env.get('SUPABASE_URL') || workerEnv['SUPABASE_URL'])!;
    const supabaseServiceKey = (Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || workerEnv['SUPABASE_SERVICE_ROLE_KEY'])!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });
    const botToken = (Deno.env.get('TELEGRAM_BOT_TOKEN') || workerEnv['TELEGRAM_BOT_TOKEN'])!;

    // Find the code
    const { data: authCode, error: findError } = await supabase
      .from('telegram_auth_codes')
      .select('*')
      .eq('code', code)
      .eq('verified', false)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle();

    if (findError || !authCode) {
      console.log('Code not found or expired:', code);
      return new Response(
        JSON.stringify({ error: 'Неверный или истёкший код. Запросите новый код в боте.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Mark code as verified immediately
    await supabase
      .from('telegram_auth_codes')
      .update({ verified: true })
      .eq('id', authCode.id);

    const telegramId = authCode.telegram_id;
    const email = `tg_${telegramId}@telegram.subday.app`;
    const password = `tg_${telegramId}_${botToken.slice(0, 10)}`;
    const displayName = [authCode.first_name, authCode.last_name].filter(Boolean).join(' ') || authCode.username || `User ${telegramId}`;
    const telegramText = authCode.username ? `@${authCode.username}` : 'нет username';
    const timeStr = new Date().toLocaleString('ru-RU', { timeZone: 'Asia/Almaty' });

    // Try to sign in first
    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
      email, password,
    });

    if (signInData?.session) {
      console.log('User signed in via Telegram code:', telegramId);
      
      // Fire-and-forget background work
      sendAdminNotification(supabase, workerEnv, 'admin_login_telegram', {
        name: displayName,
        telegram: telegramText,
        time: timeStr,
      });
      (async () => {
        try {
          if (authCode.photo_url) {
            const url = await downloadAndUploadAvatar(supabase, authCode.photo_url, signInData.session!.user.id);
            if (url) await supabase.from('profiles').update({ avatar_url: url }).eq('user_id', signInData.session!.user.id);
          }
          await supabase.from('telegram_auth_codes').delete().eq('telegram_id', telegramId);
        } catch (e) { console.error('Background work error:', e); }
      })();
        
      return new Response(
        JSON.stringify({ session: signInData.session }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // New user registration
    if (signInError?.message?.includes('Invalid login credentials')) {
      const { data: signUpData, error: signUpError } = await supabase.auth.admin.createUser({
        email, password, email_confirm: true,
        user_metadata: { telegram_id: telegramId, telegram_username: authCode.username, full_name: displayName },
      });

      if (signUpError) {
        return new Response(
          JSON.stringify({ error: 'Ошибка создания аккаунта' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Create profile and stats in parallel
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
        return new Response(
          JSON.stringify({ error: 'Ошибка входа после регистрации' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Fire-and-forget
      sendAdminNotification(supabase, workerEnv, 'admin_register_telegram', {
        name: displayName,
        telegram: telegramText,
        time: timeStr,
      });
      (async () => {
        try {
          if (authCode.photo_url) {
            const url = await downloadAndUploadAvatar(supabase, authCode.photo_url, signUpData.user!.id);
            if (url) await supabase.from('profiles').update({ avatar_url: url }).eq('user_id', signUpData.user!.id);
          }
          await supabase.from('telegram_auth_codes').delete().eq('telegram_id', telegramId);
        } catch (e) { console.error('Background error:', e); }
      })();

      return new Response(
        JSON.stringify({ session: newSignInData.session }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Ошибка входа' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Telegram verify error:', error);
    return new Response(
      JSON.stringify({ error: 'Внутренняя ошибка сервера' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});