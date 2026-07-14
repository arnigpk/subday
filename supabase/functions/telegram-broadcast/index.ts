import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

type AudienceType = 'all' | 'subscribers' | 'no_subscription' | 'expiring_soon' | 'new_users' | 'inactive';

interface BroadcastRequest {
  message: string;
  targetType: 'all' | 'specific';
  audienceTypes?: AudienceType[];
  audienceType?: AudienceType; // backward compat
  userIds?: string[];
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    let workerEnv: Record<string, string> = {};
    try { workerEnv = JSON.parse(req.headers.get('x-worker-env') || '{}'); } catch { /* ignore */ }
    const supabaseUrl = (Deno.env.get('SUPABASE_URL') || workerEnv['SUPABASE_URL'])!;
    const supabaseServiceKey = (Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || workerEnv['SUPABASE_SERVICE_ROLE_KEY'])!;
    const telegramBotToken = (Deno.env.get('TELEGRAM_BOT_TOKEN') || workerEnv['TELEGRAM_BOT_TOKEN'])!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify admin
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user: authUser }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !authUser) {
      console.error('Auth error:', authError);
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const user = { id: authUser.id };

    const { data: roleData } = await supabase
      .from('user_roles').select('role')
      .eq('user_id', user.id).in('role', ['admin', 'superadmin']).maybeSingle();

    if (!roleData) {
      return new Response(JSON.stringify({ error: 'Admin access required' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body: BroadcastRequest = await req.json();
    const { message, targetType, userIds } = body;
    // Support both old single audienceType and new array audienceTypes
    const audienceTypes: AudienceType[] = body.audienceTypes || (body.audienceType ? [body.audienceType] : ['all']);

    if (!message || message.trim() === '') {
      return new Response(JSON.stringify({ error: 'Message is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Resolve user IDs based on audience
    let filteredUserIds: string[] | null = null;

    if (targetType === 'specific' && userIds && userIds.length > 0) {
      filteredUserIds = userIds;
    } else if (!audienceTypes.includes('all')) {
      filteredUserIds = await resolveAudienceUserIds(supabase, audienceTypes);
    }

    // Get telegram users (paginated to bypass 1000-row limit)
    const allTelegramProfiles: any[] = [];
    let from = 0;
    const pageSize = 1000;
    while (true) {
      let q = supabase.from('profiles').select('id, phone, name, user_id').like('phone', '+telegram_%').range(from, from + pageSize - 1);
      if (filteredUserIds !== null) {
        q = q.in('user_id', filteredUserIds);
      }
      const { data, error: profilesError } = await q;
      if (profilesError) {
        return new Response(JSON.stringify({ error: 'Failed to fetch users' }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (!data || data.length === 0) break;
      allTelegramProfiles.push(...data);
      if (data.length < pageSize) break;
      from += pageSize;
    }

    const profiles = allTelegramProfiles;

    if (!profiles || profiles.length === 0) {
      return new Response(JSON.stringify({ success: true, sent: 0, total: 0, message: 'No Telegram users found' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Queueing telegram broadcast to ${profiles.length} users (audience: ${audienceTypes.join(',')})`);

    // Ставим рассылку в фоновую очередь — отправку делает broadcast-worker батчами,
    // чтобы не упираться в лимит времени edge-воркера при любом объёме.
    const recipientsList = profiles.map((p: any) => ({ name: p.name || '', telegram_id: (p.phone as string).replace('+telegram_', '') }));

    // 1) Шапка рассылки (статус queued).
    const { data: bm, error: bmErr } = await supabase.from('broadcast_messages').insert({
      message: message.trim(),
      broadcast_type: 'telegram',
      target_type: audienceTypes.join(','),
      recipient_count: profiles.length,
      sent_count: 0,
      failed_count: 0,
      status: 'queued',
      sent_by: user.id,
      recipients: recipientsList,
    }).select('id').single();
    if (bmErr || !bm) {
      console.error('Failed to create broadcast header:', bmErr);
      return new Response(JSON.stringify({ error: 'Не удалось создать рассылку' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 2) Получатели в очередь (bulk-insert пачками).
    const queueRows = profiles.map((p: any) => ({
      broadcast_id: bm.id, channel: 'telegram', target: (p.phone as string).replace('+telegram_', ''), user_id: p.user_id,
    }));
    for (let i = 0; i < queueRows.length; i += 500) {
      const { error: qErr } = await supabase.from('broadcast_queue').insert(queueRows.slice(i, i + 500));
      if (qErr) console.error('Failed to enqueue batch:', qErr);
    }

    // 3) Пинаем воркер, чтобы отправка началась сразу (cron — страховка).
    fetch(`${supabaseUrl}/functions/v1/broadcast-worker`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseServiceKey}` },
      body: '{}',
    }).catch(() => {});

    return new Response(JSON.stringify({
      success: true, queued: profiles.length, total: profiles.length, broadcast_id: bm.id,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('Broadcast error:', err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : 'Unknown error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// Paginated fetch to bypass 1000-row default limit
async function fetchAllRows(supabase: any, table: string, selectCols: string, filters?: (q: any) => any): Promise<any[]> {
  const results: any[] = [];
  let from = 0;
  const pageSize = 1000;
  while (true) {
    let q = supabase.from(table).select(selectCols).range(from, from + pageSize - 1);
    if (filters) q = filters(q);
    const { data } = await q;
    if (!data || data.length === 0) break;
    results.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return results;
}

async function resolveAudienceUserIds(supabase: any, audienceTypes: AudienceType[]): Promise<string[]> {
  const now = new Date();
  const allResults: Set<string> = new Set();

  for (const audienceType of audienceTypes) {
    const ids = await resolveOneAudience(supabase, audienceType, now);
    ids.forEach(id => allResults.add(id));
  }

  return [...allResults];
}

async function resolveOneAudience(supabase: any, audienceType: AudienceType, now: Date): Promise<string[]> {
  switch (audienceType) {
    case 'subscribers': {
      const data = await fetchAllRows(supabase, 'user_subscriptions', 'user_id', (q: any) => q.eq('is_active', true));
      return [...new Set(data.map((r: any) => r.user_id))];
    }
    case 'no_subscription': {
      const [allProfiles, activeSubs] = await Promise.all([
        fetchAllRows(supabase, 'profiles', 'user_id'),
        fetchAllRows(supabase, 'user_subscriptions', 'user_id', (q: any) => q.eq('is_active', true)),
      ]);
      const activeSet = new Set(activeSubs.map((r: any) => r.user_id));
      return allProfiles.map((p: any) => p.user_id).filter((uid: string) => !activeSet.has(uid));
    }
    case 'expiring_soon': {
      const fiveDaysLater = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000).toISOString();
      const data = await fetchAllRows(supabase, 'user_subscriptions', 'user_id', (q: any) =>
        q.eq('is_active', true).lte('expires_at', fiveDaysLater).gte('expires_at', now.toISOString())
      );
      return [...new Set(data.map((r: any) => r.user_id))];
    }
    case 'new_users': {
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const data = await fetchAllRows(supabase, 'profiles', 'user_id', (q: any) => q.gte('created_at', sevenDaysAgo));
      return data.map((p: any) => p.user_id);
    }
    case 'inactive': {
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const [allProfiles, recentActive, activeSubs] = await Promise.all([
        fetchAllRows(supabase, 'profiles', 'user_id'),
        fetchAllRows(supabase, 'redemptions', 'user_id', (q: any) => q.gte('redeemed_at', thirtyDaysAgo)),
        fetchAllRows(supabase, 'user_subscriptions', 'user_id', (q: any) => q.eq('is_active', true)),
      ]);
      const activeSet = new Set([
        ...recentActive.map((r: any) => r.user_id),
        ...activeSubs.map((r: any) => r.user_id),
      ]);
      return allProfiles.map((p: any) => p.user_id).filter((uid: string) => !activeSet.has(uid));
    }
    default:
      return [];
  }
}
