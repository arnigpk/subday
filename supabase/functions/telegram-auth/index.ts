import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface TelegramAuthData {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
}

async function verifyTelegramAuth(authData: TelegramAuthData, botToken: string): Promise<boolean> {
  const { hash, ...data } = authData;
  
  // Create data-check-string
  const checkArr = Object.entries(data)
    .filter(([_, value]) => value !== undefined && value !== null)
    .map(([key, value]) => `${key}=${value}`)
    .sort();
  const dataCheckString = checkArr.join('\n');
  
  const encoder = new TextEncoder();
  
  // Create secret key: SHA256(bot_token)
  const secretKeyData = await crypto.subtle.digest(
    'SHA-256',
    encoder.encode(botToken)
  );
  
  // Import secret key for HMAC
  const secretKey = await crypto.subtle.importKey(
    'raw',
    secretKeyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  
  // Calculate HMAC of data-check-string
  const signature = await crypto.subtle.sign(
    'HMAC',
    secretKey,
    encoder.encode(dataCheckString)
  );
  
  // Convert to hex string
  const calculatedHash = Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  
  // Verify hash matches
  if (calculatedHash !== hash) {
    console.log('Hash mismatch:', { calculated: calculatedHash, received: hash });
    return false;
  }
  
  // Check auth_date is not too old (24 hours)
  const now = Math.floor(Date.now() / 1000);
  if (now - authData.auth_date > 86400) {
    console.log('Auth data too old');
    return false;
  }
  
  return true;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { authData } = await req.json();
    
    if (!authData || !authData.id || !authData.hash || !authData.auth_date) {
      return new Response(
        JSON.stringify({ error: 'Неверные данные авторизации' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let workerEnv: Record<string, string> = {};
    try { workerEnv = JSON.parse(req.headers.get('x-worker-env') || '{}'); } catch { /* ignore */ }
    const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN') || workerEnv['TELEGRAM_BOT_TOKEN'];
    if (!botToken) {
      console.error('TELEGRAM_BOT_TOKEN not set');
      return new Response(
        JSON.stringify({ error: 'Сервер не настроен' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify Telegram auth data
    const isValid = await verifyTelegramAuth(authData, botToken);
    if (!isValid) {
      console.log('Invalid Telegram auth data');
      return new Response(
        JSON.stringify({ error: 'Неверная подпись Telegram' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create Supabase admin client
    const supabaseUrl = (Deno.env.get('SUPABASE_URL') || workerEnv['SUPABASE_URL'])!;
    const supabaseServiceKey = (Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || workerEnv['SUPABASE_SERVICE_ROLE_KEY'])!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const telegramId = authData.id.toString();
    const email = `tg_${telegramId}@telegram.subday.app`;
    const password = `tg_${telegramId}_${botToken.slice(0, 10)}`;
    const displayName = [authData.first_name, authData.last_name].filter(Boolean).join(' ') || authData.username || `User ${telegramId}`;

    // Try to sign in first
    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInData?.session) {
      console.log('User signed in via Telegram:', telegramId);
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
          telegram_username: authData.username,
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

      // Create profile
      if (signUpData.user) {
        await supabase.from('profiles').insert({
          user_id: signUpData.user.id,
          phone: `+telegram_${telegramId}`,
          name: displayName,
          avatar_url: authData.photo_url || null,
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

      console.log('New user created and signed in via Telegram:', telegramId);
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
    console.error('Telegram auth error:', error);
    return new Response(
      JSON.stringify({ error: 'Внутренняя ошибка сервера' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
