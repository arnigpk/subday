import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

  const action = isNewUser ? '🆕 Новая регистрация' : '🔑 Вход';
  const usernameText = telegramUsername ? `@${telegramUsername}` : 'нет username';
  const message = `${action} через Telegram\n\n👤 Имя: ${displayName}\n📱 Telegram: ${usernameText}\n🕐 ${new Date().toLocaleString('ru-RU', { timeZone: 'Asia/Almaty' })}`;

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

async function downloadAndUploadAvatar(
  supabase: any,
  telegramAvatarUrl: string,
  userId: string
): Promise<string | null> {
  try {
    console.log('Downloading avatar from:', telegramAvatarUrl);
    
    // Download the image from Telegram
    const response = await fetch(telegramAvatarUrl);
    if (!response.ok) {
      console.error('Failed to download avatar:', response.status);
      return null;
    }
    
    const imageBlob = await response.blob();
    const arrayBuffer = await imageBlob.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);
    
    // Upload to Supabase Storage
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

    // Get public URL
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
    const { code } = await req.json();
    
    if (!code || code.length !== 6) {
      return new Response(
        JSON.stringify({ error: 'Введите 6-значный код' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN')!;

    // Find the code
    const { data: authCode, error: findError } = await supabase
      .from('telegram_auth_codes')
      .select('*')
      .eq('code', code)
      .eq('verified', false)
      .gt('expires_at', new Date().toISOString())
      .single();

    if (findError || !authCode) {
      console.log('Code not found or expired:', code);
      return new Response(
        JSON.stringify({ error: 'Неверный или истёкший код' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Mark code as verified
    await supabase
      .from('telegram_auth_codes')
      .update({ verified: true })
      .eq('id', authCode.id);

    const telegramId = authCode.telegram_id;
    const email = `tg_${telegramId}@telegram.subday.app`;
    const password = `tg_${telegramId}_${botToken.slice(0, 10)}`;
    const displayName = [authCode.first_name, authCode.last_name].filter(Boolean).join(' ') || authCode.username || `User ${telegramId}`;

    // Try to sign in first
    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInData?.session) {
      console.log('User signed in via Telegram code:', telegramId);
      
      // Send login notification
      await sendLoginNotification(displayName, authCode.username, false);
      
      // Update avatar if available and user exists
      if (authCode.photo_url) {
        const permanentAvatarUrl = await downloadAndUploadAvatar(
          supabase,
          authCode.photo_url,
          signInData.session.user.id
        );
        
        if (permanentAvatarUrl) {
          await supabase
            .from('profiles')
            .update({ avatar_url: permanentAvatarUrl })
            .eq('user_id', signInData.session.user.id);
        }
      }
      
      // Clean up old codes
      await supabase
        .from('telegram_auth_codes')
        .delete()
        .eq('telegram_id', telegramId);
        
      return new Response(
        JSON.stringify({ session: signInData.session }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // If sign in failed, create new user
    if (signInError?.message?.includes('Invalid login credentials')) {
      const { data: signUpData, error: signUpError } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          telegram_id: telegramId,
          telegram_username: authCode.username,
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

      // Download and upload avatar to storage
      let permanentAvatarUrl: string | null = null;
      if (signUpData.user && authCode.photo_url) {
        permanentAvatarUrl = await downloadAndUploadAvatar(
          supabase,
          authCode.photo_url,
          signUpData.user.id
        );
      }

      // Create profile with permanent avatar URL
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

      // Send notification for new user
      await sendLoginNotification(displayName, authCode.username, true);
      
      // Clean up old codes
      await supabase
        .from('telegram_auth_codes')
        .delete()
        .eq('telegram_id', telegramId);

      console.log('New user created via Telegram code:', telegramId);
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
    console.error('Telegram verify error:', error);
    return new Response(
      JSON.stringify({ error: 'Внутренняя ошибка сервера' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
