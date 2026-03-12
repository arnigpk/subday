import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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
}

// Get OAuth2 access token from service account
async function getAccessToken(serviceAccount: any): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = btoa(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = btoa(JSON.stringify({
    iss: serviceAccount.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }));

  const pemContents = serviceAccount.private_key
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\n/g, '');

  const binaryKey = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0));

  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    binaryKey,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signatureInput = new TextEncoder().encode(`${header}.${payload}`);
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', cryptoKey, signatureInput);
  const signatureB64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  const jwt = `${header.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}.${payload.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}.${signatureB64}`;

  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });

  const tokenData = await tokenResponse.json();
  if (!tokenResponse.ok) {
    throw new Error(`Failed to get access token: ${JSON.stringify(tokenData)}`);
  }

  return tokenData.access_token;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const fcmServiceAccountJson = Deno.env.get('FCM_SERVICE_ACCOUNT');

    let serviceAccount: any = null;
    if (fcmServiceAccountJson) {
      try {
        serviceAccount = JSON.parse(fcmServiceAccountJson);
      } catch (parseError) {
        console.error('Invalid FCM_SERVICE_ACCOUNT JSON:', parseError);
        return new Response(JSON.stringify({ error: 'Invalid FCM_SERVICE_ACCOUNT format' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    const canSendDevicePush = Boolean(
      serviceAccount?.project_id && serviceAccount?.client_email && serviceAccount?.private_key,
    );
    const projectId = serviceAccount?.project_id;
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
      });

      return new Response(JSON.stringify({
        success: true,
        sent: 0,
        failed: 0,
        total: 0,
        recipient_count: 0,
        in_app_created: 0,
        push_enabled: canSendDevicePush,
        message: 'No users in selected audience',
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get FCM tokens from device_tokens table
    let query = supabase.from('device_tokens').select('token, user_id').eq('platform', 'android');
    if (filteredUserIds !== null) {
      query = query.in('user_id', filteredUserIds);
    }

    const { data: tokens, error: tokensError } = await query;
    if (tokensError) {
      console.error('Error fetching tokens:', tokensError);
      return new Response(JSON.stringify({ error: 'Failed to fetch device tokens' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const deviceTokens = tokens || [];

    let successCount = 0;
    let failCount = 0;
    let skippedCount = 0;
    const invalidTokens: string[] = [];

    if (deviceTokens.length > 0 && canSendDevicePush) {
      const accessToken = await getAccessToken(serviceAccount);

      for (const deviceToken of deviceTokens) {
        try {
          const fcmResponse = await fetch(
            `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
            {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                message: {
                  token: deviceToken.token,
                  notification: {
                    title,
                    body: message,
                  },
                  android: {
                    priority: 'high',
                    notification: {
                      sound: 'default',
                      channel_id: 'default',
                    },
                  },
                },
              }),
            }
          );

          if (fcmResponse.ok) {
            successCount++;
          } else {
            const errorData = await fcmResponse.json();
            failCount++;
            console.error(`FCM send failed for token ${deviceToken.token.slice(0, 10)}...:`, errorData);

            if (
              errorData?.error?.code === 404 ||
              errorData?.error?.details?.some((d: any) => d.errorCode === 'UNREGISTERED')
            ) {
              invalidTokens.push(deviceToken.token);
            }
          }
        } catch (err) {
          failCount++;
          console.error('FCM send error:', err);
        }
      }
    } else if (deviceTokens.length > 0) {
      skippedCount = deviceTokens.length;
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
      push_enabled: canSendDevicePush,
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
      const { data } = await supabase.from('user_subscriptions').select('user_id').eq('is_active', true);
      return uniqueUserIds((data || []).map((r: any) => r.user_id));
    }
    case 'no_subscription': {
      const { data: allProfiles } = await supabase.from('profiles').select('user_id');
      const { data: activeSubs } = await supabase.from('user_subscriptions').select('user_id').eq('is_active', true);
      const activeSet = new Set((activeSubs || []).map((r: any) => r.user_id));
      return uniqueUserIds((allProfiles || []).map((p: any) => p.user_id).filter((uid: string) => !activeSet.has(uid)));
    }
    case 'expiring_soon': {
      const fiveDaysLater = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000).toISOString();
      const { data } = await supabase
        .from('user_subscriptions')
        .select('user_id')
        .eq('is_active', true)
        .lte('expires_at', fiveDaysLater)
        .gte('expires_at', now.toISOString());
      return uniqueUserIds((data || []).map((r: any) => r.user_id));
    }
    case 'new_users': {
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data } = await supabase.from('profiles').select('user_id').gte('created_at', sevenDaysAgo);
      return uniqueUserIds((data || []).map((p: any) => p.user_id));
    }
    case 'inactive': {
      const { data: allProfiles } = await supabase.from('profiles').select('user_id');
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const { data: recentActive } = await supabase.from('redemptions').select('user_id').gte('redeemed_at', thirtyDaysAgo);
      const { data: activeSubs } = await supabase.from('user_subscriptions').select('user_id').eq('is_active', true);
      const activeSet = new Set([
        ...(recentActive || []).map((r: any) => r.user_id),
        ...(activeSubs || []).map((r: any) => r.user_id),
      ]);
      return uniqueUserIds((allProfiles || []).map((p: any) => p.user_id).filter((uid: string) => !activeSet.has(uid)));
    }
    default:
      return [];
  }
}

async function resolveRecipientUserIds(supabase: any, filteredUserIds: string[] | null): Promise<string[]> {
  if (filteredUserIds !== null) {
    return uniqueUserIds(filteredUserIds);
  }

  const { data, error } = await supabase.from('profiles').select('user_id');
  if (error) {
    throw new Error('Failed to resolve recipients');
  }

  return uniqueUserIds((data || []).map((p: any) => p.user_id));
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
