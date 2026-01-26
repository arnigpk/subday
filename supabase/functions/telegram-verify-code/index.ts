import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

      // Create profile
      if (signUpData.user) {
        await supabase.from('profiles').insert({
          user_id: signUpData.user.id,
          phone: `+telegram_${telegramId}`,
          name: displayName,
          avatar_url: authCode.photo_url || null,
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
