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
    
    if (!hash) {
      console.log('No hash in initData');
      return false;
    }
    
    params.delete('hash');
    
    // Sort parameters alphabetically and create data check string
    const dataCheckArr = Array.from(params.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value}`);
    const dataCheckString = dataCheckArr.join('\n');
    
    console.log('Data check string:', dataCheckString);
    
    // secret_key = HMAC-SHA256("WebAppData", bot_token)
    const encoder = new TextEncoder();
    const keyData = encoder.encode('WebAppData');
    const secretKey = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const secretData = await crypto.subtle.sign('HMAC', secretKey, encoder.encode(botToken));
    
    // hash = HMAC-SHA256(secret_key, data_check_string)
    const dataKey = await crypto.subtle.importKey(
      'raw',
      secretData,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const signature = await crypto.subtle.sign('HMAC', dataKey, encoder.encode(dataCheckString));
    
    const calculatedHash = Array.from(new Uint8Array(signature))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    
    console.log('Calculated hash:', calculatedHash);
    console.log('Received hash:', hash);
    
    return calculatedHash === hash;
  } catch (error) {
    console.error('Validation error:', error);
    return false;
  }
}

async function sendLoginNotification(
  displayName: string,
  telegramUsername: string | null,
  isNewUser: boolean
): Promise<void> {
  const notificationBotToken = Deno.env.get('NOTIFICATION_BOT_TOKEN');
  const chatId = Deno.env.get('NOTIFICATION_CHAT_ID');
  
  if (!notificationBotToken || !chatId) {
    console.log('Notification bot not configured');
    return;
  }

  const action = isNewUser ? '🆕 Новая регистрация (Mini App)' : '🔑 Вход (Mini App)';
  const usernameText = telegramUsername ? `@${telegramUsername}` : 'нет username';
  const message = `${action}\n\n👤 Имя: ${displayName}\n📱 Telegram: ${usernameText}\n🕐 ${new Date().toLocaleString('ru-RU', { timeZone: 'Asia/Almaty' })}`;

  try {
    await fetch(`https://api.telegram.org/bot${notificationBotToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: 'HTML'
      })
    });
    console.log('Login notification sent');
  } catch (error) {
    console.error('Failed to send notification:', error);
  }
}

async function getTelegramAvatarUrl(botToken: string, telegramId: number): Promise<string | null> {
  try {
    // Get user profile photos
    const photosResponse = await fetch(
      `https://api.telegram.org/bot${botToken}/getUserProfilePhotos?user_id=${telegramId}&limit=1`
    );
    const photosData = await photosResponse.json();
    
    if (!photosData.ok || !photosData.result?.photos?.length) {
      return null;
    }
    
    // Get the largest photo
    const photos = photosData.result.photos[0];
    const largestPhoto = photos[photos.length - 1];
    
    // Get file path
    const fileResponse = await fetch(
      `https://api.telegram.org/bot${botToken}/getFile?file_id=${largestPhoto.file_id}`
    );
    const fileData = await fileResponse.json();
    
    if (!fileData.ok || !fileData.result?.file_path) {
      return null;
    }
    
    return `https://api.telegram.org/file/bot${botToken}/${fileData.result.file_path}`;
  } catch (error) {
    console.error('Error getting avatar:', error);
    return null;
  }
}

async function downloadAndUploadAvatar(
  supabase: any,
  telegramAvatarUrl: string,
  userId: string
): Promise<string | null> {
  try {
    console.log('Downloading avatar from:', telegramAvatarUrl);
    
    const response = await fetch(telegramAvatarUrl);
    if (!response.ok) {
      console.error('Failed to download avatar:', response.status);
      return null;
    }
    
    const imageBlob = await response.blob();
    const arrayBuffer = await imageBlob.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);
    
    const filePath = `${userId}/avatar.jpg`;
    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(filePath, uint8Array, {
        contentType: 'image/jpeg',
        upsert: true,
      });

    if (uploadError) {
      console.error('Upload error:', uploadError);
      return null;
    }

    const { data: { publicUrl } } = supabase.storage
      .from('avatars')
      .getPublicUrl(filePath);

    console.log('Avatar uploaded successfully:', publicUrl);
    return publicUrl;
  } catch (error) {
    console.error('Avatar upload error:', error);
    return null;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { initData } = await req.json();
    
    if (!initData) {
      return new Response(
        JSON.stringify({ error: 'initData is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Received initData length:', initData.length);

    const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN')!;
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    // Validate initData signature
    const isValid = await validateTelegramWebAppData(initData, botToken);
    
    if (!isValid) {
      console.log('Invalid initData signature');
      return new Response(
        JSON.stringify({ error: 'Invalid initData signature' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse user data from initData
    const params = new URLSearchParams(initData);
    const userDataStr = params.get('user');
    const authDate = parseInt(params.get('auth_date') || '0', 10);
    
    if (!userDataStr) {
      return new Response(
        JSON.stringify({ error: 'No user data in initData' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check auth_date is not too old (24 hours)
    const now = Math.floor(Date.now() / 1000);
    if (now - authDate > 86400) {
      return new Response(
        JSON.stringify({ error: 'Auth data expired' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userData = JSON.parse(userDataStr);
    const telegramId = userData.id;
    const firstName = userData.first_name || '';
    const lastName = userData.last_name || '';
    const username = userData.username || null;
    const displayName = [firstName, lastName].filter(Boolean).join(' ') || username || `User ${telegramId}`;

    console.log('User from Mini App:', telegramId, displayName);

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    const email = `tg_${telegramId}@telegram.subday.app`;
    const password = `tg_${telegramId}_${botToken.slice(0, 10)}`;

    // Try to sign in first
    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInData?.session) {
      console.log('User signed in via Mini App:', telegramId);
      
      await sendLoginNotification(displayName, username, false);
      
      return new Response(
        JSON.stringify({ session: signInData.session }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // If sign in failed, create new user
    if (signInError?.message?.includes('Invalid login credentials')) {
      console.log('Creating new user from Mini App:', telegramId);
      
      const { data: signUpData, error: signUpError } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          telegram_id: telegramId,
          telegram_username: username,
          full_name: displayName,
        },
      });

      if (signUpError) {
        console.error('Sign up error:', signUpError);
        return new Response(
          JSON.stringify({ error: 'Ошибка создания аккаунта' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Get and upload avatar
      let permanentAvatarUrl: string | null = null;
      if (signUpData.user) {
        const telegramAvatarUrl = await getTelegramAvatarUrl(botToken, telegramId);
        if (telegramAvatarUrl) {
          permanentAvatarUrl = await downloadAndUploadAvatar(
            supabase,
            telegramAvatarUrl,
            signUpData.user.id
          );
        }
      }

      // Create profile
      if (signUpData.user) {
        await supabase.from('profiles').insert({
          user_id: signUpData.user.id,
          phone: `+telegram_${telegramId}`,
          name: displayName,
          avatar_url: permanentAvatarUrl,
        });

        // Create initial user stats
        await supabase.from('user_stats').insert({
          user_id: signUpData.user.id,
          coffee_remaining: 0,
          coffee_total: 0,
          drinks_remaining: 0,
          drinks_total: 0,
          current_streak: 0,
          max_streak: 0,
          total_cups: 0,
          bonus_points: 0,
        });
      }

      // Sign in the new user
      const { data: newSignInData, error: newSignInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (newSignInError || !newSignInData.session) {
        console.error('Sign in after signup error:', newSignInError);
        return new Response(
          JSON.stringify({ error: 'Ошибка входа после регистрации' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      await sendLoginNotification(displayName, username, true);

      console.log('New user created via Mini App:', telegramId);
      return new Response(
        JSON.stringify({ session: newSignInData.session }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.error('Unexpected sign in error:', signInError);
    return new Response(
      JSON.stringify({ error: 'Ошибка входа' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Mini app auth error:', error);
    return new Response(
      JSON.stringify({ error: 'Внутренняя ошибка сервера' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
