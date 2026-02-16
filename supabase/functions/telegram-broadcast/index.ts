import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

interface BroadcastRequest {
  message: string;
  targetType: 'all' | 'specific';
  userIds?: string[];
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const telegramBotToken = Deno.env.get('TELEGRAM_BOT_TOKEN')!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify the user is admin
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: authError } = await authClient.auth.getClaims(token);

    if (authError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const user = { id: claimsData.claims.sub as string };

    // Check if user is admin
    const { data: roleData } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .maybeSingle();

    if (!roleData) {
      return new Response(JSON.stringify({ error: 'Admin access required' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { message, targetType, userIds }: BroadcastRequest = await req.json();

    if (!message || message.trim() === '') {
      return new Response(JSON.stringify({ error: 'Message is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get telegram users to send to
    let query = supabase
      .from('profiles')
      .select('id, phone, name')
      .like('phone', '+telegram_%');

    if (targetType === 'specific' && userIds && userIds.length > 0) {
      query = query.in('id', userIds);
    }

    const { data: profiles, error: profilesError } = await query;

    if (profilesError) {
      console.error('Error fetching profiles:', profilesError);
      return new Response(JSON.stringify({ error: 'Failed to fetch users' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!profiles || profiles.length === 0) {
      return new Response(JSON.stringify({ 
        success: true, 
        sent: 0, 
        message: 'No Telegram users found' 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Sending broadcast to ${profiles.length} users`);

    let successCount = 0;
    let failCount = 0;
    const errors: string[] = [];

    for (const profile of profiles) {
      try {
        // Extract telegram ID from phone (+telegram_XXXXXXX)
        const telegramId = profile.phone.replace('+telegram_', '');

        const telegramResponse = await fetch(
          `https://api.telegram.org/bot${telegramBotToken}/sendMessage`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: telegramId,
              text: message,
              parse_mode: 'HTML',
            }),
          }
        );

        const result = await telegramResponse.json();

        if (result.ok) {
          successCount++;
          console.log(`Message sent to ${profile.name || telegramId}`);
        } else {
          failCount++;
          errors.push(`Failed to send to ${profile.name || telegramId}: ${result.description}`);
          console.error(`Failed to send to ${telegramId}:`, result.description);
        }
      } catch (err) {
        failCount++;
        const errorMsg = err instanceof Error ? err.message : 'Unknown error';
        errors.push(`Error sending to ${profile.name}: ${errorMsg}`);
        console.error(`Error sending to ${profile.phone}:`, err);
      }
    }

    console.log(`Broadcast complete: ${successCount} sent, ${failCount} failed`);

    // Save broadcast to history
    try {
      await supabase
        .from('broadcast_messages')
        .insert({
          message: message.trim(),
          broadcast_type: 'telegram',
          target_type: targetType,
          recipient_count: profiles.length,
          sent_count: successCount,
          failed_count: failCount,
          sent_by: user.id,
        });
    } catch (historyError) {
      console.error('Error saving broadcast history:', historyError);
      // Don't fail the whole operation if history save fails
    }

    return new Response(JSON.stringify({
      success: true,
      sent: successCount,
      failed: failCount,
      total: profiles.length,
      errors: errors.length > 0 ? errors : undefined,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('Broadcast error:', err);
    const errorMsg = err instanceof Error ? err.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMsg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
