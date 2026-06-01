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

interface NotificationRequest {
  type: 'activated' | 'activated_special' | 'low_balance' | 'expiring_soon' | 'guest_coffee' | 'subscription_expired';
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

// (FCM OAuth helpers moved to ../_shared/fcm.ts)

// Send FCM push to a specific user's devices
async function sendFcmPushToUser(
  supabase: any,
  userId: string,
  title: string,
  body: string,
): Promise<{ sent: number; failed: number }> {
  const { serviceAccount, parseError } = parseFcmServiceAccount(Deno.env.get('FCM_SERVICE_ACCOUNT'));
  if (!serviceAccount) {
    console.warn('FCM key unavailable:', parseError);
    return { sent: 0, failed: 0 };
  }

  const { data: tokens } = await supabase
    .from('device_tokens')
    .select('token')
    .eq('user_id', userId);

  if (!tokens || tokens.length === 0) {
    console.log('No device tokens for user:', userId);
    return { sent: 0, failed: 0 };
  }

  let accessToken: string;
  try {
    accessToken = await getFcmAccessToken(serviceAccount);
  } catch (err) {
    console.error('FCM OAuth failed:', err);
    return { sent: 0, failed: tokens.length };
  }

  let sent = 0;
  let failed = 0;
  const invalidTokens: string[] = [];

  for (const deviceToken of tokens) {
    const result = await sendFcmMessage(accessToken, serviceAccount.project_id, deviceToken.token, {
      title,
      body,
    });
    if (result.ok) {
      sent++;
    } else {
      failed++;
      console.error('FCM send failed:', result.error);
      if (isInvalidFcmTokenError(result.error)) invalidTokens.push(deviceToken.token);
    }
  }

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
    case 'subscription_expired': return '❌ Подписка закончилась';
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
      } else if (type === 'subscription_expired') {
        message = `❌ Ваша подписка ${subName} закончилась. Оформите новую, чтобы продолжить пользоваться кофе ☕`;
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
    const inAppEnabled = (matchedTemplate?.trigger_config as any)?.in_app_enabled !== false;
    const title = getNotificationTitle(type);
    let telegramSent = false;
    let pushInAppCreated = false;
    let fcmResult = { sent: 0, failed: 0 };

    // Send Telegram if applicable
    if ((channel === 'telegram' || channel === 'both') && telegramId && telegramBotToken) {
      telegramSent = await sendTelegramMessage(telegramId, message, telegramBotToken);
    }

    // Send Push notification if applicable (in-app + FCM device push are independent)
    if (channel === 'push' || channel === 'both') {
      // 1. Create in-app notification (visible in notification bell) — only if in_app_enabled
      if (inAppEnabled) {
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
      } else {
        console.log('In-app notification skipped (disabled in template)');
      }

      // 2. Send actual FCM device push notification (always, if channel includes push)
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
