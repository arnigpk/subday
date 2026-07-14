import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  parseFcmServiceAccount,
  getFcmAccessToken,
  sendFcmMessage,
  isInvalidFcmTokenError,
} from '../_shared/fcm.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

type AudienceType = 'all' | 'subscribers' | 'no_subscription' | 'expiring_soon' | 'new_users' | 'inactive';

interface FCMRequest {
  title: string;
  message: string;
  targetUserIds?: string[];
  audienceTypes?: AudienceType[];
  diagnose?: boolean;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Self-hosted edge runtime delivers secrets via the `x-worker-env` header,
    // not always through Deno.env. Read both — same pattern as the payment
    // webhooks — otherwise createClient() throws "supabaseUrl is required".
    let workerEnv: Record<string, string> = {};
    try { workerEnv = JSON.parse(req.headers.get('x-worker-env') || '{}'); } catch { /* ignore */ }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || workerEnv['SUPABASE_URL'];
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || workerEnv['SUPABASE_SERVICE_ROLE_KEY'];
    const fcmServiceAccountJson = Deno.env.get('FCM_SERVICE_ACCOUNT') || workerEnv['FCM_SERVICE_ACCOUNT'];

    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(JSON.stringify({ error: 'Backend not configured (missing SUPABASE_URL / service role key)' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { serviceAccount, diagnostics, parseError } = parseFcmServiceAccount(fcmServiceAccountJson);
    let pushConfigError: string | null = parseError;
    const canSendDevicePush = !!serviceAccount;
    const projectId = serviceAccount?.project_id;
    console.log('FCM key diagnostics:', diagnostics);
    const supabase = createClient(supabaseUrl, supabaseServiceKey);


    // Verify admin
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user: authUser }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !authUser) {
      console.error('Auth error:', authError);
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const userId = authUser.id;
    const { data: roleData } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .in('role', ['admin', 'superadmin'])
      .maybeSingle();

    if (!roleData) {
      return new Response(JSON.stringify({ error: 'Admin access required' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body: FCMRequest = await req.json();
    const audienceTypes: AudienceType[] = body.audienceTypes || ['all'];
    const title = body.title?.trim();
    const message = body.message?.trim();
    const targetUserIds = body.targetUserIds;

    // Diagnostic mode: report what we know about the configured FCM key
    // (no secret values are returned) and try a real OAuth handshake.
    if (body.diagnose) {
      let oauthOk = false;
      let oauthError: string | null = null;
      if (serviceAccount) {
        try {
          await getFcmAccessToken(serviceAccount);
          oauthOk = true;
        } catch (e) {
          oauthError = e instanceof Error ? e.message : String(e);
        }
      }
      return new Response(JSON.stringify({
        success: true,
        mode: 'diagnose',
        diagnostics,
        parse_error: parseError,
        oauth_ok: oauthOk,
        oauth_error: oauthError,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (!title || !message) {
      return new Response(JSON.stringify({ error: 'Title and message are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }


    // Resolve audience user IDs
    let filteredUserIds: string[] | null = null;
    if (targetUserIds && targetUserIds.length > 0) {
      filteredUserIds = uniqueUserIds(targetUserIds);
    } else if (!audienceTypes.includes('all')) {
      filteredUserIds = await resolveAudienceUserIds(supabase, audienceTypes);
    }

    const recipientUserIds = await resolveRecipientUserIds(supabase, filteredUserIds);

    if (recipientUserIds.length === 0) {
      await savePushBroadcastHistory(supabase, {
        sentBy: userId,
        title,
        message,
        targetType: audienceTypes.join(','),
        recipientCount: 0,
        sentCount: 0,
        failedCount: 0,
        recipients: [],
      });

      return new Response(JSON.stringify({
        success: true,
        sent: 0,
        failed: 0,
        total: 0,
        recipient_count: 0,
        in_app_created: 0,
        push_enabled: canSendDevicePush && !pushConfigError,
        push_error: pushConfigError,
        message: 'No users in selected audience',
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get FCM tokens from device_tokens table (all platforms — let FCM
    // reject unregistered tokens; we clean them up below).
    // NOTE: when an audience filter is applied we must NOT pass the whole
    // user-id list to a single .in() — a large list overflows the request
    // URL length limit and the query fails with a 500. Fetch in chunks,
    // same as createInAppNotifications / fetchRecipientsMeta do.
    let deviceTokens: { token: string; user_id: string }[] = [];
    try {
      if (filteredUserIds === null) {
        // 'all' audience — no filter, single query for every token.
        const { data, error } = await supabase
          .from('device_tokens')
          .select('token, user_id');
        if (error) throw error;
        deviceTokens = data || [];
      } else {
        const CHUNK = 100;
        for (let i = 0; i < filteredUserIds.length; i += CHUNK) {
          const batch = filteredUserIds.slice(i, i + CHUNK);
          const { data, error } = await supabase
            .from('device_tokens')
            .select('token, user_id')
            .in('user_id', batch);
          if (error) throw error;
          if (data) deviceTokens.push(...data);
        }
      }
    } catch (tokensError) {
      console.error('Error fetching tokens:', tokensError);
      return new Response(JSON.stringify({ error: 'Failed to fetch device tokens' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let successCount = 0;
    let failCount = 0;
    let skippedCount = 0;
    const invalidTokens: string[] = [];

    if (deviceTokens.length > 0 && canSendDevicePush && serviceAccount && projectId) {
      try {
        const accessToken = await getFcmAccessToken(serviceAccount);

        // Батчами параллельно — последовательная отправка сотням устройств упиралась
        // бы в лимит времени edge-воркера. FCM держит высокую конкурентность.
        const FCM_CONCURRENCY = 50;
        for (let i = 0; i < deviceTokens.length; i += FCM_CONCURRENCY) {
          const batch = deviceTokens.slice(i, i + FCM_CONCURRENCY);
          const results = await Promise.all(batch.map(async (dt) => {
            const result = await sendFcmMessage(accessToken, projectId, dt.token, { title, body: message });
            return { token: dt.token, result };
          }));
          for (const { token, result } of results) {
            if (result.ok) {
              successCount++;
            } else {
              failCount++;
              console.error(`FCM send failed for token ${token.slice(0, 10)}... (status ${result.status}):`, result.error);
              if (isInvalidFcmTokenError(result.error)) invalidTokens.push(token);
            }
          }
        }
      } catch (err) {
        pushConfigError = err instanceof Error ? err.message : 'Failed to initialize FCM delivery';
        skippedCount = deviceTokens.length;
        console.error('FCM delivery disabled for this request:', err);
      }
    } else if (deviceTokens.length > 0) {
      skippedCount = deviceTokens.length;
      pushConfigError ||= 'FCM credentials are not configured. Device push skipped; in-app notifications only.';
      console.warn('FCM credentials are not configured. Device push skipped; in-app notifications only.');
    }


    if (invalidTokens.length > 0) {
      await supabase.from('device_tokens').delete().in('token', invalidTokens);
      console.log(`Cleaned up ${invalidTokens.length} invalid tokens`);
    }

    const inAppCreated = await createInAppNotifications(supabase, {
      title,
      message,
      createdBy: userId,
      recipientUserIds,
    });

    // Fetch recipient names for history metadata
    const recipientsMeta = await fetchRecipientsMeta(supabase, recipientUserIds);

    await savePushBroadcastHistory(supabase, {
      sentBy: userId,
      title,
      message,
      targetType: audienceTypes.join(','),
      recipientCount: recipientUserIds.length,
      sentCount: successCount,
      failedCount: failCount,
      recipients: recipientsMeta,
    });

    return new Response(JSON.stringify({
      success: true,
      sent: successCount,
      failed: failCount,
      skipped: skippedCount,
      total: deviceTokens.length,
      recipient_count: recipientUserIds.length,
      in_app_created: inAppCreated,
      push_enabled: canSendDevicePush && !pushConfigError,
      push_error: pushConfigError,
      cleaned: invalidTokens.length,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('FCM push error:', err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
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
    ids.forEach((id: string) => allResults.add(id));
  }

  return [...allResults];
}

async function resolveOneAudience(supabase: any, audienceType: AudienceType, now: Date): Promise<string[]> {
  switch (audienceType) {
    case 'subscribers': {
      const data = await fetchAllRows(supabase, 'user_subscriptions', 'user_id', (q: any) => q.eq('is_active', true));
      return uniqueUserIds(data.map((r: any) => r.user_id));
    }
    case 'no_subscription': {
      const [allProfiles, activeSubs] = await Promise.all([
        fetchAllRows(supabase, 'profiles', 'user_id'),
        fetchAllRows(supabase, 'user_subscriptions', 'user_id', (q: any) => q.eq('is_active', true)),
      ]);
      const activeSet = new Set(activeSubs.map((r: any) => r.user_id));
      return uniqueUserIds(allProfiles.map((p: any) => p.user_id).filter((uid: string) => !activeSet.has(uid)));
    }
    case 'expiring_soon': {
      const fiveDaysLater = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000).toISOString();
      const data = await fetchAllRows(supabase, 'user_subscriptions', 'user_id', (q: any) =>
        q.eq('is_active', true).lte('expires_at', fiveDaysLater).gte('expires_at', now.toISOString())
      );
      return uniqueUserIds(data.map((r: any) => r.user_id));
    }
    case 'new_users': {
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const data = await fetchAllRows(supabase, 'profiles', 'user_id', (q: any) => q.gte('created_at', sevenDaysAgo));
      return uniqueUserIds(data.map((p: any) => p.user_id));
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
      return uniqueUserIds(allProfiles.map((p: any) => p.user_id).filter((uid: string) => !activeSet.has(uid)));
    }
    default:
      return [];
  }
}

async function resolveRecipientUserIds(supabase: any, filteredUserIds: string[] | null): Promise<string[]> {
  if (filteredUserIds !== null) {
    return uniqueUserIds(filteredUserIds);
  }

  const data = await fetchAllRows(supabase, 'profiles', 'user_id');
  return uniqueUserIds(data.map((p: any) => p.user_id));
}

async function createInAppNotifications(
  supabase: any,
  params: { title: string; message: string; createdBy: string; recipientUserIds: string[] },
): Promise<number> {
  const { title, message, createdBy, recipientUserIds } = params;
  if (recipientUserIds.length === 0) return 0;

  const batchSize = 500;
  let inserted = 0;

  for (let i = 0; i < recipientUserIds.length; i += batchSize) {
    const batch = recipientUserIds.slice(i, i + batchSize).map((userId) => ({
      title,
      message,
      user_id: userId,
      created_by: createdBy,
    }));

    const { error } = await supabase.from('push_notifications').insert(batch);
    if (error) {
      console.error('Failed to insert in-app notifications batch:', error);
      continue;
    }

    inserted += batch.length;
  }

  return inserted;
}

async function fetchRecipientsMeta(
  supabase: any,
  userIds: string[],
): Promise<{ name: string; user_id: string }[]> {
  if (userIds.length === 0) return [];
  const batchSize = 500;
  const results: { name: string; user_id: string }[] = [];
  for (let i = 0; i < userIds.length; i += batchSize) {
    const batch = userIds.slice(i, i + batchSize);
    const { data } = await supabase.from('profiles').select('user_id, name, phone').in('user_id', batch);
    (data || []).forEach((p: any) => {
      results.push({ name: p.name || p.phone || 'Без имени', user_id: p.user_id });
    });
  }
  return results;
}

async function savePushBroadcastHistory(
  supabase: any,
  params: {
    sentBy: string;
    title: string;
    message: string;
    targetType: string;
    recipientCount: number;
    sentCount: number;
    failedCount: number;
    recipients: { name: string; user_id: string }[];
  },
): Promise<void> {
  const { sentBy, title, message, targetType, recipientCount, sentCount, failedCount, recipients } = params;

  const { error } = await supabase.from('broadcast_messages').insert({
    message: `${title}\n${message}`,
    broadcast_type: 'push',
    target_type: targetType,
    recipient_count: recipientCount,
    sent_count: sentCount,
    failed_count: failedCount,
    sent_by: sentBy,
    recipients: recipients,
  });

  if (error) {
    console.error('Failed to save push broadcast history:', error);
  }
}

function uniqueUserIds(ids: unknown[]): string[] {
  return [...new Set(ids.filter((id): id is string => typeof id === 'string' && id.length > 0))];
}
