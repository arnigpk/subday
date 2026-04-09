import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const { shopId, coffeeName, syrup, customerName } = await req.json();

    if (!shopId || !coffeeName) {
      return new Response(JSON.stringify({ error: 'shopId and coffeeName required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Find all baristas and partners for this shop
    const { data: staffRoles } = await supabase
      .from('user_roles')
      .select('user_id')
      .eq('shop_id', shopId)
      .in('role', ['partner', 'barista']);

    const staffUserIds = staffRoles?.map((r: any) => r.user_id) || [];

    if (staffUserIds.length === 0) {
      return new Response(JSON.stringify({ success: true, sent: 0, message: 'No staff found' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get device tokens for staff
    const { data: tokens } = await supabase
      .from('device_tokens')
      .select('token, user_id')
      .in('user_id', staffUserIds);

    if (!tokens || tokens.length === 0) {
      console.log('No device tokens for staff, skipping FCM push');
      return new Response(JSON.stringify({ success: true, sent: 0, message: 'No device tokens' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check FCM credentials
    const fcmServiceAccountJson = Deno.env.get('FCM_SERVICE_ACCOUNT');
    if (!fcmServiceAccountJson) {
      console.warn('FCM_SERVICE_ACCOUNT not configured, skipping push');
      return new Response(JSON.stringify({ success: true, sent: 0, push_enabled: false }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let serviceAccount: any;
    try {
      serviceAccount = JSON.parse(fcmServiceAccountJson);
    } catch {
      console.error('Invalid FCM_SERVICE_ACCOUNT JSON');
      return new Response(JSON.stringify({ success: true, sent: 0, push_enabled: false }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!serviceAccount.project_id || !serviceAccount.client_email || !serviceAccount.private_key) {
      return new Response(JSON.stringify({ success: true, sent: 0, push_enabled: false }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const accessToken = await getAccessToken(serviceAccount);
    const title = '☕ Новый предзаказ!';
    const syrupText = syrup ? ` + ${syrup}` : '';
    const body = `${customerName || 'Клиент'}: ${coffeeName}${syrupText}`;

    let sent = 0;
    let failed = 0;

    for (const deviceToken of tokens) {
      try {
        const fcmResponse = await fetch(
          `https://fcm.googleapis.com/v1/projects/${serviceAccount.project_id}/messages:send`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              message: {
                token: deviceToken.token,
                notification: { title, body },
                android: {
                  priority: 'high',
                  notification: {
                    sound: 'default',
                    channel_id: 'preorders',
                  },
                },
                apns: {
                  payload: {
                    aps: {
                      sound: 'default',
                      badge: 1,
                    },
                  },
                },
              },
            }),
          }
        );

        if (fcmResponse.ok) {
          sent++;
        } else {
          failed++;
          const err = await fcmResponse.json();
          console.error('FCM error:', err);

          // Clean invalid tokens
          if (err?.error?.code === 404 || err?.error?.details?.some((d: any) => d.errorCode === 'UNREGISTERED')) {
            await supabase.from('device_tokens').delete().eq('token', deviceToken.token);
          }
        }
      } catch (err) {
        failed++;
        console.error('FCM send error:', err);
      }
    }

    return new Response(JSON.stringify({ success: true, sent, failed, push_enabled: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('preorder-notify error:', err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

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
