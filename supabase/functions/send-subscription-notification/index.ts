import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

interface NotificationRequest {
  type: 'activated' | 'activated_special' | 'low_balance' | 'expiring_soon' | 'guest_coffee';
  userId: string;
  cupsCount?: number;
  daysCount?: number;
  subscriptionName?: string;
  drinkType?: 'coffee' | 'drinks';
}

function extractTelegramId(phone: string): string | null {
  const match = phone.match(/^\+telegram_(\d+)$/);
  return match ? match[1] : null;
}

async function sendTelegramMessage(telegramId: string, message: string, botToken: string): Promise<boolean> {
  try {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: telegramId,
        text: message,
        parse_mode: 'HTML',
      }),
    });

    const result = await response.json();
    
    if (!result.ok) {
      console.error('Telegram API error:', result);
      return false;
    }
    
    console.log('Telegram message sent successfully to:', telegramId);
    return true;
  } catch (error) {
    console.error('Error sending Telegram message:', error);
    return false;
  }
}

// Get OAuth2 access token from FCM service account
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

// Send FCM push to a specific user's devices
async function sendFcmPushToUser(
  supabase: any,
  userId: string,
  title: string,
  body: string,
): Promise<{ sent: number; failed: number }> {
  const fcmServiceAccountJson = Deno.env.get('FCM_SERVICE_ACCOUNT');
  if (!fcmServiceAccountJson) {
    console.warn('FCM_SERVICE_ACCOUNT not configured, skipping device push');
    return { sent: 0, failed: 0 };
  }

  let serviceAccount: any;
  try {
    serviceAccount = JSON.parse(fcmServiceAccountJson);
  } catch {
    console.error('Invalid FCM_SERVICE_ACCOUNT JSON');
    return { sent: 0, failed: 0 };
  }

  if (!serviceAccount?.project_id || !serviceAccount?.client_email || !serviceAccount?.private_key) {
    console.warn('FCM service account incomplete, skipping device push');
    return { sent: 0, failed: 0 };
  }

  // Fetch user's device tokens
  const { data: tokens } = await supabase
    .from('device_tokens')
    .select('token')
    .eq('user_id', userId);

  if (!tokens || tokens.length === 0) {
    console.log('No device tokens for user:', userId);
    return { sent: 0, failed: 0 };
  }

  const accessToken = await getAccessToken(serviceAccount);
  const projectId = serviceAccount.project_id;
  let sent = 0;
  let failed = 0;
  const invalidTokens: string[] = [];

  for (const deviceToken of tokens) {
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
              notification: { title, body },
              android: {
                priority: 'high',
                notification: { sound: 'default', channel_id: 'default' },
              },
            },
          }),
        }
      );

      if (fcmResponse.ok) {
        sent++;
      } else {
        const errorData = await fcmResponse.json();
        failed++;
        console.error(`FCM send failed:`, errorData);
        if (
          errorData?.error?.code === 404 ||
          errorData?.error?.details?.some((d: any) => d.errorCode === 'UNREGISTERED')
        ) {
          invalidTokens.push(deviceToken.token);
        }
      }
    } catch (err) {
      failed++;
      console.error('FCM send error:', err);
    }
  }

  // Cleanup invalid tokens
  if (invalidTokens.length > 0) {
    await supabase.from('device_tokens').delete().in('token', invalidTokens);
    console.log(`Cleaned up ${invalidTokens.length} invalid tokens`);
  }

  return { sent, failed };
}

function getUnitWord(count: number, drinkType?: string): string {
  if (drinkType === 'drinks') {
    return count === 2 ? 'ланча' : 'ланчей';
  }
  return count === 2 ? 'напитка' : 'напитков';
}

function getDaysWord(count: number): string {
  if (count === 1) return 'день';
  if (count >= 2 && count <= 4) return 'дня';
  return 'дней';
}

function renderTemplate(template: string, vars: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
  }
  return result;
}

function getNotificationTitle(type: string): string {
  switch (type) {
    case 'activated_special': return '🎉 Спецпредложение активировано';
    case 'activated': return '🎉 Подписка активирована';
    case 'low_balance': return '⚠️ Низкий баланс';
    case 'expiring_soon': return '⚠️ Подписка заканчивается';
    case 'guest_coffee': return '🎁 Подарок кофе';
    default: return '📢 Уведомление';
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body: NotificationRequest = await req.json();
    const { type, userId, cupsCount, daysCount, subscriptionName, drinkType } = body;

    console.log('Processing notification:', { type, userId, cupsCount, daysCount, subscriptionName });

    if (!type || !userId) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const telegramBotToken = Deno.env.get('TELEGRAM_BOT_TOKEN');

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch matching templates from DB
    const { data: templates } = await supabase
      .from('auto_notification_templates')
      .select('*')
      .eq('trigger_type', type)
      .eq('is_active', true);

    // Find matching template based on threshold
    let matchedTemplate: any = null;
    if (templates && templates.length > 0) {
      for (const tmpl of templates) {
        const config = (tmpl.trigger_config || {}) as Record<string, number>;
        if (type === 'low_balance' && config.threshold) {
          if (cupsCount === config.threshold) {
            matchedTemplate = tmpl;
            break;
          }
        } else if (type === 'expiring_soon' && config.threshold) {
          if (daysCount === config.threshold) {
            matchedTemplate = tmpl;
            break;
          }
        } else if (type === 'activated' || type === 'activated_special' || type === 'guest_coffee') {
          matchedTemplate = tmpl;
          break;
        }
      }
    }

    // Get user profile
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('phone, name')
      .eq('user_id', userId)
      .maybeSingle();

    if (profileError || !profile) {
      console.error('Profile not found:', profileError);
      return new Response(
        JSON.stringify({ success: false, error: 'User not found' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const telegramId = extractTelegramId(profile.phone);
    const subName = subscriptionName || 'Подписка';

    // Build message - use template if available, otherwise use defaults
    let message: string;
    const count = type === 'low_balance' ? (cupsCount || 5) : (daysCount || 5);
    const unit = type === 'low_balance' 
      ? getUnitWord(count, drinkType)
      : getDaysWord(count);

    if (matchedTemplate) {
      message = renderTemplate(matchedTemplate.message_template, {
        subscription_name: subName,
        count: String(count),
        unit: unit,
      });
    } else {
      // Fallback defaults
      if (type === 'activated_special') {
        message = `🎉 Подписка 🎁СПЕЦПРЕДЛОЖЕНИЕ🎁 успешно активирована! 🚀 Наслаждайтесь😌`;
      } else if (type === 'activated') {
        message = `🎉 Подписка ${subName} успешно активирована! 🚀 Наслаждайтесь😌`;
      } else if (type === 'low_balance') {
        message = `⚠️ У вас осталось ${count} ${unit} по подписке ${subName}`;
      } else if (type === 'expiring_soon') {
        message = `⚠️ У вас осталось ${count} ${unit} до окончания подписки ${subName}`;
      } else if (type === 'guest_coffee') {
        message = `🎁 Поздравляем, ваш друг подарил вам 1 кофе на 10 дней, попробуйте subday 💚`;
      } else {
        return new Response(
          JSON.stringify({ error: 'Invalid notification type' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    const channel = matchedTemplate?.channel || 'telegram';
    const title = getNotificationTitle(type);
    let telegramSent = false;
    let pushInAppCreated = false;
    let fcmResult = { sent: 0, failed: 0 };

    // Send Telegram if applicable
    if ((channel === 'telegram' || channel === 'both') && telegramId && telegramBotToken) {
      telegramSent = await sendTelegramMessage(telegramId, message, telegramBotToken);
    }

    // Send Push notification if applicable (in-app + FCM device push)
    if (channel === 'push' || channel === 'both') {
      // 1. Create in-app notification (visible in notification bell)
      try {
        await supabase.from('push_notifications').insert({
          title,
          message,
          user_id: userId,
        });
        pushInAppCreated = true;
        console.log('In-app notification created');
      } catch (pushErr) {
        console.error('In-app notification error:', pushErr);
      }

      // 2. Send actual FCM device push notification
      fcmResult = await sendFcmPushToUser(supabase, userId, title, message);
      console.log('FCM push result:', fcmResult);
    }

    if (!telegramId && (channel === 'telegram' || channel === 'both')) {
      console.log('User is not a Telegram user, skipping Telegram notification:', profile.phone);
    }

    return new Response(
      JSON.stringify({
        success: true,
        telegramSent,
        pushInAppCreated,
        fcmDeviceSent: fcmResult.sent,
        fcmDeviceFailed: fcmResult.failed,
        type,
        channel,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
