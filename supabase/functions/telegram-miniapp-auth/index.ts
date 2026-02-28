import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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

  // Fire-and-forget
  fetch(`https://api.telegram.org/bot${notificationBotToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: 'HTML' })
  }).catch(e => console.error('Notification failed:', e));
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

async function getTelegramAvatarUrl(botToken: string, telegramId: number): Promise<string | null> {
  try {
    const photosResponse = await fetch(
      `https://api.telegram.org/bot${botToken}/getUserProfilePhotos?user_id=${telegramId}&limit=1`
    );
    const photosData = await photosResponse.json();
    if (!photosData.ok || !photosData.result?.photos?.length) return null;
    const photos = photosData.result.photos[0];
    const largestPhoto = photos[photos.length - 1];
    const fileResponse = await fetch(
      `https://api.telegram.org/bot${botToken}/getFile?file_id=${largestPhoto.file_id}`
    );
    const fileData = await fileResponse.json();
    if (!fileData.ok || !fileData.result?.file_path) return null;
    return `https://api.telegram.org/file/bot${botToken}/${fileData.result.file_path}`;
  } catch { return null; }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { initData } = await req.json();
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

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const email = `tg_${telegramId}@telegram.subday.app`;
    const password = `tg_${telegramId}_${botToken.slice(0, 10)}`;

    // Try to sign in first (fast path for existing users)
    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
      email, password,
    });

    if (signInData?.session) {
      // RETURN IMMEDIATELY - notification is fire-and-forget
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

      // Create profile and stats in parallel (no avatar - do it in background)
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

      // Sign in the new user
      const { data: newSignInData, error: newSignInError } = await supabase.auth.signInWithPassword({
        email, password,
      });

      if (newSignInError || !newSignInData.session) {
        return new Response(JSON.stringify({ error: 'Ошибка входа после регистрации' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // Return session IMMEDIATELY, do avatar + notification in background
      const session = newSignInData.session;
      sendLoginNotification(displayName, username, true);
      
      // Background: upload avatar
      if (signUpData.user) {
        (async () => {
          try {
            const avatarUrl = await getTelegramAvatarUrl(botToken, telegramId);
            if (avatarUrl) {
              const permanentUrl = await downloadAndUploadAvatar(supabase, avatarUrl, signUpData.user!.id);
              if (permanentUrl) {
                await supabase.from('profiles').update({ avatar_url: permanentUrl }).eq('user_id', signUpData.user!.id);
              }
            }
          } catch (e) { console.error('Background avatar error:', e); }
        })();
      }

      return new Response(
        JSON.stringify({ session }),
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