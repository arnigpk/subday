import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

type AudienceType = 'all' | 'subscribers' | 'no_subscription' | 'expiring_soon' | 'new_users' | 'inactive';

interface BroadcastRequest {
  message: string;
  targetType: 'all' | 'specific';
  audienceType?: AudienceType;
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

    const { message, targetType, audienceType = 'all', userIds }: BroadcastRequest = await req.json();

    if (!message || message.trim() === '') {
      return new Response(JSON.stringify({ error: 'Message is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // --- Resolve user IDs based on audience type ---
    let filteredUserIds: string[] | null = null; // null = no filter (all telegram users)

    if (targetType === 'specific' && userIds && userIds.length > 0) {
      filteredUserIds = userIds;
    } else if (audienceType !== 'all') {
      filteredUserIds = await resolveAudienceUserIds(supabase, audienceType);
    }

    // Get telegram users to send to
    let query = supabase
      .from('profiles')
      .select('id, phone, name')
      .like('phone', '+telegram_%');

    if (filteredUserIds !== null) {
      if (filteredUserIds.length === 0) {
        return new Response(JSON.stringify({ success: true, sent: 0, failed: 0, total: 0, message: 'Нет пользователей в выбранной аудитории' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      query = query.in('id', filteredUserIds);
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
        total: 0,
        message: 'No Telegram users found' 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Sending broadcast to ${profiles.length} users (audience: ${audienceType})`);

    let successCount = 0;
    let failCount = 0;
    const errors: string[] = [];

    for (const profile of profiles) {
      try {
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
        } else {
          failCount++;
          errors.push(`Failed: ${profile.name || telegramId}: ${result.description}`);
          console.error(`Failed to send to ${telegramId}:`, result.description);
        }
      } catch (err) {
        failCount++;
        const errorMsg = err instanceof Error ? err.message : 'Unknown error';
        errors.push(`Error: ${profile.name}: ${errorMsg}`);
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
          target_type: audienceType,
          recipient_count: profiles.length,
          sent_count: successCount,
          failed_count: failCount,
          sent_by: user.id,
        });
    } catch (historyError) {
      console.error('Error saving broadcast history:', historyError);
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

async function resolveAudienceUserIds(supabase: any, audienceType: AudienceType): Promise<string[]> {
  const now = new Date();

  switch (audienceType) {
    case 'subscribers': {
      const { data } = await supabase
        .from('user_subscriptions')
        .select('user_id')
        .eq('is_active', true);
      return [...new Set((data || []).map((r: any) => r.user_id))];
    }

    case 'no_subscription': {
      // All profile user_ids minus those with active subscriptions
      const { data: allProfiles } = await supabase.from('profiles').select('user_id');
      const { data: activeSubs } = await supabase
        .from('user_subscriptions')
        .select('user_id')
        .eq('is_active', true);

      const activeSet = new Set((activeSubs || []).map((r: any) => r.user_id));
      return (allProfiles || [])
        .map((p: any) => p.user_id)
        .filter((uid: string) => !activeSet.has(uid));
    }

    case 'expiring_soon': {
      const fiveDaysLater = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000).toISOString();
      const { data } = await supabase
        .from('user_subscriptions')
        .select('user_id')
        .eq('is_active', true)
        .lte('expires_at', fiveDaysLater)
        .gte('expires_at', now.toISOString());
      return [...new Set((data || []).map((r: any) => r.user_id))];
    }

    case 'new_users': {
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data } = await supabase
        .from('profiles')
        .select('user_id')
        .gte('created_at', sevenDaysAgo);
      return (data || []).map((p: any) => p.user_id);
    }

    case 'inactive': {
      // Users who registered but have no redemptions in last 30 days and no active subscription
      const { data: allProfiles } = await supabase.from('profiles').select('user_id');
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

      const { data: recentActive } = await supabase
        .from('redemptions')
        .select('user_id')
        .gte('redeemed_at', thirtyDaysAgo);

      const { data: activeSubs } = await supabase
        .from('user_subscriptions')
        .select('user_id')
        .eq('is_active', true);

      const activeSet = new Set([
        ...(recentActive || []).map((r: any) => r.user_id),
        ...(activeSubs || []).map((r: any) => r.user_id),
      ]);

      return (allProfiles || [])
        .map((p: any) => p.user_id)
        .filter((uid: string) => !activeSet.has(uid));
    }

    default:
      return [];
  }
}
