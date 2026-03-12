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

  // Import private key for signing
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
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

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

    if (!fcmServiceAccountJson) {
      return new Response(JSON.stringify({ error: 'FCM_SERVICE_ACCOUNT not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const serviceAccount = JSON.parse(fcmServiceAccountJson);
    const projectId = serviceAccount.project_id;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify admin
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
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
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const userId = claimsData.claims.sub as string;
    const { data: roleData } = await supabase
      .from('user_roles').select('role')
      .eq('user_id', userId).in('role', ['admin', 'superadmin']).maybeSingle();

    if (!roleData) {
      return new Response(JSON.stringify({ error: 'Admin access required' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body: FCMRequest = await req.json();
    const { title, message, targetUserIds } = body;
    const audienceTypes: AudienceType[] = body.audienceTypes || ['all'];

    if (!title?.trim() || !message?.trim()) {
      return new Response(JSON.stringify({ error: 'Title and message are required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Resolve audience user IDs
    let filteredUserIds: string[] | null = null;
    if (targetUserIds && targetUserIds.length > 0) {
      filteredUserIds = targetUserIds;
    } else if (!audienceTypes.includes('all')) {
      filteredUserIds = await resolveAudienceUserIds(supabase, audienceTypes);
    }

    // Get FCM tokens from device_tokens table
    let query = supabase.from('device_tokens').select('token, user_id').eq('platform', 'android');
    if (filteredUserIds !== null) {
      if (filteredUserIds.length === 0) {
        return new Response(JSON.stringify({ success: true, sent: 0, total: 0, message: 'No users in selected audience' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      query = query.in('user_id', filteredUserIds);
    }

    const { data: tokens, error: tokensError } = await query;
    if (tokensError) {
      console.error('Error fetching tokens:', tokensError);
      return new Response(JSON.stringify({ error: 'Failed to fetch device tokens' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!tokens || tokens.length === 0) {
      return new Response(JSON.stringify({ success: true, sent: 0, total: 0, message: 'No devices registered' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get OAuth2 access token for FCM v1 API
    const accessToken = await getAccessToken(serviceAccount);

    let successCount = 0;
    let failCount = 0;
    const invalidTokens: string[] = [];

    // Send to each device
    for (const deviceToken of tokens) {
      try {
        const fcmResponse = await fetch(
          `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              message: {
                token: deviceToken.token,
                notification: {
                  title: title.trim(),
                  body: message.trim(),
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

          // Mark invalid tokens for cleanup
          if (errorData?.error?.code === 404 || errorData?.error?.details?.some((d: any) => d.errorCode === 'UNREGISTERED')) {
            invalidTokens.push(deviceToken.token);
          }
        }
      } catch (err) {
        failCount++;
        console.error('FCM send error:', err);
      }
    }

    // Cleanup invalid tokens
    if (invalidTokens.length > 0) {
      await supabase.from('device_tokens').delete().in('token', invalidTokens);
      console.log(`Cleaned up ${invalidTokens.length} invalid tokens`);
    }

    return new Response(JSON.stringify({
      success: true,
      sent: successCount,
      failed: failCount,
      total: tokens.length,
      cleaned: invalidTokens.length,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('FCM push error:', err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : 'Unknown error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
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
      return [...new Set((data || []).map((r: any) => r.user_id))];
    }
    case 'no_subscription': {
      const { data: allProfiles } = await supabase.from('profiles').select('user_id');
      const { data: activeSubs } = await supabase.from('user_subscriptions').select('user_id').eq('is_active', true);
      const activeSet = new Set((activeSubs || []).map((r: any) => r.user_id));
      return (allProfiles || []).map((p: any) => p.user_id).filter((uid: string) => !activeSet.has(uid));
    }
    case 'expiring_soon': {
      const fiveDaysLater = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000).toISOString();
      const { data } = await supabase.from('user_subscriptions').select('user_id')
        .eq('is_active', true).lte('expires_at', fiveDaysLater).gte('expires_at', now.toISOString());
      return [...new Set((data || []).map((r: any) => r.user_id))];
    }
    case 'new_users': {
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data } = await supabase.from('profiles').select('user_id').gte('created_at', sevenDaysAgo);
      return (data || []).map((p: any) => p.user_id);
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
      return (allProfiles || []).map((p: any) => p.user_id).filter((uid: string) => !activeSet.has(uid));
    }
    default:
      return [];
  }
}
