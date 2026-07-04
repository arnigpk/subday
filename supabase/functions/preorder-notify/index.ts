import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  parseFcmServiceAccount,
  getFcmAccessToken,
  sendFcmMessage,
  isInvalidFcmTokenError,
} from '../_shared/fcm.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    let workerEnv: Record<string, string> = {};
    try { workerEnv = JSON.parse(req.headers.get('x-worker-env') || '{}'); } catch { /* ignore */ }
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || workerEnv['SUPABASE_URL'];
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || workerEnv['SUPABASE_SERVICE_ROLE_KEY'];
    const supabase = createClient(supabaseUrl!, serviceKey!);

    const { shopId, coffeeName, syrup, customerName, shopAddress } = await req.json();

    if (!shopId || !coffeeName) {
      return new Response(JSON.stringify({ error: 'shopId and coffeeName required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get shop name
    const { data: shop } = await supabase
      .from('shops')
      .select('name')
      .eq('id', shopId)
      .single();

    const shopName = shop?.name || 'Неизвестная кофейня';

    // Find partners (always notified) and baristas for this shop
    const { data: staffRoles } = await supabase
      .from('user_roles')
      .select('user_id, role')
      .eq('shop_id', shopId)
      .in('role', ['partner', 'barista']);

    const partnerUserIds = staffRoles?.filter((r: any) => r.role === 'partner').map((r: any) => r.user_id) || [];
    const baristaUserIds = staffRoles?.filter((r: any) => r.role === 'barista').map((r: any) => r.user_id) || [];

    // Filter baristas: only those on shift at the specific address
    let targetBaristaIds: string[] = [];
    if (baristaUserIds.length > 0 && shopAddress) {
      const { data: activeShifts } = await supabase
        .from('barista_shifts')
        .select('user_id, address, expires_at')
        .in('user_id', baristaUserIds)
        .eq('address', shopAddress)
        .gte('expires_at', new Date().toISOString());

      targetBaristaIds = activeShifts?.map((s: any) => s.user_id) || [];
    } else if (baristaUserIds.length > 0 && !shopAddress) {
      // No address specified — notify all baristas (fallback)
      targetBaristaIds = baristaUserIds;
    }

    // Combine: partners always + baristas on the right address
    const staffUserIds = [...new Set([...partnerUserIds, ...targetBaristaIds])];

    // Get template for preorder notifications
    const { data: template } = await supabase
      .from('auto_notification_templates')
      .select('message_template, is_active, channel, trigger_config')
      .eq('trigger_type', 'preorder_new')
      .eq('is_active', true)
      .maybeSingle();

    const now = new Date();
    const timeStr = now.toLocaleString('ru-RU', { timeZone: 'Asia/Aqtau', hour: '2-digit', minute: '2-digit' });

    const variables: Record<string, string> = {
      shop_name: shopName,
      coffee_name: coffeeName,
      syrup: syrup || 'нет',
      customer_name: customerName || 'Клиент',
      time: timeStr,
      shop_address: shopAddress || '',
    };

    // Build message from template or use default
    let notificationMessage: string;
    const channel = template?.channel || 'both';
    // in_app_enabled defaults to true for backward compatibility; can be disabled per-template in admin
    const inAppEnabled = (template?.trigger_config as any)?.in_app_enabled !== false;
    if (template?.message_template) {
      notificationMessage = template.message_template;
      for (const [key, value] of Object.entries(variables)) {
        notificationMessage = notificationMessage.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
      }
    } else {
      const syrupText = syrup ? ` + ${syrup}` : '';
      const addrText = shopAddress ? `\n📍 Адрес: ${shopAddress}` : '';
      notificationMessage = `☕ Новый предзаказ!\n\n🏪 Кофейня: ${shopName}${addrText}\n☕ Напиток: ${coffeeName}${syrupText}\n👤 Клиент: ${customerName || 'Клиент'}\n🕐 ${timeStr}`;
    }

    const pushTitle = '☕ Новый предзаказ!';
    // Use the admin template text for in-app + FCM body too (HTML stripped),
    // so all channels match the configured template instead of a hardcoded string.
    const pushBody = notificationMessage.replace(/<[^>]*>/g, '');

    let telegramSent = 0;
    let fcmSent = 0;
    let fcmFailed = 0;
    let inAppCreated = 0;

    console.log(`Preorder notify: shop=${shopId}, address="${shopAddress}", partners=${partnerUserIds.length}, baristas_on_address=${targetBaristaIds.length}, total_staff=${staffUserIds.length}`);

    if (staffUserIds.length === 0) {
      return new Response(JSON.stringify({ success: true, telegram_sent: 0, fcm_sent: 0, in_app_created: 0, message: 'No staff found for this address' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 1. Send personal Telegram messages to staff via @subday_lgbot
    if (channel === 'telegram' || channel === 'both') {
      const telegramBotToken = Deno.env.get('TELEGRAM_BOT_TOKEN') || workerEnv['TELEGRAM_BOT_TOKEN'];
      if (telegramBotToken) {
        const { data: staffProfiles } = await supabase
          .from('profiles')
          .select('user_id, phone')
          .in('user_id', staffUserIds);

        const telegramChatIds: string[] = [];
        staffProfiles?.forEach((p: any) => {
          if (p.phone?.startsWith('+telegram_')) {
            telegramChatIds.push(p.phone.replace('+telegram_', ''));
          }
        });

        for (const chatId of telegramChatIds) {
          try {
            const res = await fetch(`https://api.telegram.org/bot${telegramBotToken}/sendMessage`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ chat_id: chatId, text: notificationMessage, parse_mode: 'HTML' }),
            });
            if (res.ok) telegramSent++;
            else console.error('Telegram send failed:', await res.text());
          } catch (e) {
            console.error('Telegram notification failed:', e);
          }
        }
      } else {
        console.warn('TELEGRAM_BOT_TOKEN not configured');
      }
    }

    // 2. Create in-app push notifications for staff (independent of FCM device push)
    if ((channel === 'push' || channel === 'both') && inAppEnabled) {
      const pushRows = staffUserIds.map((userId: string) => ({
        title: pushTitle,
        message: pushBody,
        user_id: userId,
      }));

      const { error: pushError } = await supabase.from('push_notifications').insert(pushRows);
      if (pushError) {
        console.error('Failed to create in-app notifications:', pushError);
      } else {
        inAppCreated = pushRows.length;
      }
    }

    // 3. Send FCM push notifications to staff devices
    if (channel === 'push' || channel === 'both') {
      const { data: tokens } = await supabase
        .from('device_tokens')
        .select('token, user_id')
        .in('user_id', staffUserIds);

      if (tokens && tokens.length > 0) {
        const { serviceAccount, parseError } = parseFcmServiceAccount(Deno.env.get('FCM_SERVICE_ACCOUNT') || workerEnv['FCM_SERVICE_ACCOUNT']);
        if (!serviceAccount) {
          console.error('preorder-notify FCM key error:', parseError);
        } else {
          try {
            const accessToken = await getFcmAccessToken(serviceAccount);
            for (const deviceToken of tokens) {
              const result = await sendFcmMessage(accessToken, serviceAccount.project_id, deviceToken.token, {
                title: pushTitle,
                body: pushBody,
                androidChannelId: 'preorders',
              });
              if (result.ok) {
                fcmSent++;
              } else {
                fcmFailed++;
                console.error('preorder-notify FCM error:', result.error);
                if (isInvalidFcmTokenError(result.error)) {
                  await supabase.from('device_tokens').delete().eq('token', deviceToken.token);
                }
              }
            }
          } catch (err) {
            console.error('preorder-notify OAuth/FCM error:', err);
          }
        }
      }
    }

    return new Response(JSON.stringify({
      success: true,
      telegram_sent: telegramSent,
      fcm_sent: fcmSent,
      fcm_failed: fcmFailed,
      in_app_created: inAppCreated,
      partners_notified: partnerUserIds.length,
      baristas_notified: targetBaristaIds.length,
    }), {
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

