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
    const { telegram_id, first_name, last_name, username, photo_url, bot_token } = await req.json();
    
    // Verify bot token
    const expectedToken = Deno.env.get('TELEGRAM_BOT_TOKEN');
    if (!expectedToken || bot_token !== expectedToken) {
      console.error('Invalid bot token');
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!telegram_id) {
      return new Response(
        JSON.stringify({ error: 'telegram_id required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Generate 6-digit code
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    // Delete any existing codes for this telegram_id
    await supabase
      .from('telegram_auth_codes')
      .delete()
      .eq('telegram_id', telegram_id.toString());

    // Insert new code
    const { error: insertError } = await supabase
      .from('telegram_auth_codes')
      .insert({
        telegram_id: telegram_id.toString(),
        code,
        first_name: first_name || null,
        last_name: last_name || null,
        username: username || null,
        photo_url: photo_url || null,
        expires_at: expiresAt.toISOString(),
      });

    if (insertError) {
      console.error('Insert error:', insertError);
      return new Response(
        JSON.stringify({ error: 'Database error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Generated code ${code} for Telegram user ${telegram_id}`);

    return new Response(
      JSON.stringify({ code }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
