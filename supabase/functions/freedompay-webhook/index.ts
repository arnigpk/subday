import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// Pure JS MD5 — no WASM
function hexMd5(str: string): string {
  const utf8 = Array.from(new TextEncoder().encode(str), b => String.fromCharCode(b)).join('');
  function safeAdd(x: number, y: number) {
    const lsw = (x & 0xffff) + (y & 0xffff);
    return ((x >> 16) + (y >> 16) + (lsw >> 16)) << 16 | (lsw & 0xffff);
  }
  function rol(n: number, c: number) { return n << c | n >>> (32 - c); }
  function cmn(q: number, a: number, b: number, x: number, s: number, t: number) {
    return safeAdd(rol(safeAdd(safeAdd(a, q), safeAdd(x, t)), s), b);
  }
  function ff(a: number, b: number, c: number, d: number, x: number, s: number, t: number) { return cmn(b & c | ~b & d, a, b, x, s, t); }
  function gg(a: number, b: number, c: number, d: number, x: number, s: number, t: number) { return cmn(b & d | c & ~d, a, b, x, s, t); }
  function hh(a: number, b: number, c: number, d: number, x: number, s: number, t: number) { return cmn(b ^ c ^ d, a, b, x, s, t); }
  function ii(a: number, b: number, c: number, d: number, x: number, s: number, t: number) { return cmn(c ^ (b | ~d), a, b, x, s, t); }
  const nblk = ((utf8.length + 8) >> 6) + 1;
  const blks: number[] = new Array(nblk * 16).fill(0);
  for (let i = 0; i < utf8.length; i++) blks[i >> 2] |= utf8.charCodeAt(i) << (i % 4) * 8;
  blks[utf8.length >> 2] |= 0x80 << (utf8.length % 4) * 8;
  blks[nblk * 16 - 2] = utf8.length * 8;
  let a = 1732584193, b = -271733879, c = -1732584194, d = 271733878;
  for (let i = 0; i < blks.length; i += 16) {
    const aa = a, bb = b, cc = c, dd = d;
    a = ff(a,b,c,d,blks[i+0],7,-680876936); d = ff(d,a,b,c,blks[i+1],12,-389564586);
    c = ff(c,d,a,b,blks[i+2],17,606105819); b = ff(b,c,d,a,blks[i+3],22,-1044525330);
    a = ff(a,b,c,d,blks[i+4],7,-176418897); d = ff(d,a,b,c,blks[i+5],12,1200080426);
    c = ff(c,d,a,b,blks[i+6],17,-1473231341); b = ff(b,c,d,a,blks[i+7],22,-45705983);
    a = ff(a,b,c,d,blks[i+8],7,1770035416); d = ff(d,a,b,c,blks[i+9],12,-1958414417);
    c = ff(c,d,a,b,blks[i+10],17,-42063); b = ff(b,c,d,a,blks[i+11],22,-1990404162);
    a = ff(a,b,c,d,blks[i+12],7,1804603682); d = ff(d,a,b,c,blks[i+13],12,-40341101);
    c = ff(c,d,a,b,blks[i+14],17,-1502002290); b = ff(b,c,d,a,blks[i+15],22,1236535329);
    a = gg(a,b,c,d,blks[i+1],5,-165796510); d = gg(d,a,b,c,blks[i+6],9,-1069501632);
    c = gg(c,d,a,b,blks[i+11],14,643717713); b = gg(b,c,d,a,blks[i+0],20,-373897302);
    a = gg(a,b,c,d,blks[i+5],5,-701558691); d = gg(d,a,b,c,blks[i+10],9,38016083);
    c = gg(c,d,a,b,blks[i+15],14,-660478335); b = gg(b,c,d,a,blks[i+4],20,-405537848);
    a = gg(a,b,c,d,blks[i+9],5,568446438); d = gg(d,a,b,c,blks[i+14],9,-1019803690);
    c = gg(c,d,a,b,blks[i+3],14,-187363961); b = gg(b,c,d,a,blks[i+8],20,1163531501);
    a = gg(a,b,c,d,blks[i+13],5,-1444681467); d = gg(d,a,b,c,blks[i+2],9,-51403784);
    c = gg(c,d,a,b,blks[i+7],14,1735328473); b = gg(b,c,d,a,blks[i+12],20,-1926607734);
    a = hh(a,b,c,d,blks[i+5],4,-378558); d = hh(d,a,b,c,blks[i+8],11,-2022574463);
    c = hh(c,d,a,b,blks[i+11],16,1839030562); b = hh(b,c,d,a,blks[i+14],23,-35309556);
    a = hh(a,b,c,d,blks[i+1],4,-1530992060); d = hh(d,a,b,c,blks[i+4],11,1272893353);
    c = hh(c,d,a,b,blks[i+7],16,-155497632); b = hh(b,c,d,a,blks[i+10],23,-1094730640);
    a = hh(a,b,c,d,blks[i+13],4,681279174); d = hh(d,a,b,c,blks[i+0],11,-358537222);
    c = hh(c,d,a,b,blks[i+3],16,-722521979); b = hh(b,c,d,a,blks[i+6],23,76029189);
    a = hh(a,b,c,d,blks[i+9],4,-640364487); d = hh(d,a,b,c,blks[i+12],11,-421815835);
    c = hh(c,d,a,b,blks[i+15],16,530742520); b = hh(b,c,d,a,blks[i+2],23,-995338651);
    a = ii(a,b,c,d,blks[i+0],6,-198630844); d = ii(d,a,b,c,blks[i+7],10,1126891415);
    c = ii(c,d,a,b,blks[i+14],15,-1416354905); b = ii(b,c,d,a,blks[i+5],21,-57434055);
    a = ii(a,b,c,d,blks[i+12],6,1700485571); d = ii(d,a,b,c,blks[i+3],10,-1894986606);
    c = ii(c,d,a,b,blks[i+10],15,-1051523); b = ii(b,c,d,a,blks[i+1],21,-2054922799);
    a = ii(a,b,c,d,blks[i+8],6,1873313359); d = ii(d,a,b,c,blks[i+15],10,-30611744);
    c = ii(c,d,a,b,blks[i+6],15,-1560198380); b = ii(b,c,d,a,blks[i+13],21,1309151649);
    a = ii(a,b,c,d,blks[i+4],6,-145523070); d = ii(d,a,b,c,blks[i+11],10,-1120210379);
    c = ii(c,d,a,b,blks[i+2],15,718787259); b = ii(b,c,d,a,blks[i+9],21,-343485551);
    a = safeAdd(a, aa); b = safeAdd(b, bb); c = safeAdd(c, cc); d = safeAdd(d, dd);
  }
  const le = (n: number) =>
    ('0' + (n & 0xff).toString(16)).slice(-2) +
    ('0' + (n >>> 8 & 0xff).toString(16)).slice(-2) +
    ('0' + (n >>> 16 & 0xff).toString(16)).slice(-2) +
    ('0' + (n >>> 24 & 0xff).toString(16)).slice(-2);
  return le(a) + le(b) + le(c) + le(d);
}

function verifySignature(scriptName: string, params: Record<string, string>, secretKey: string): boolean {
  const receivedSig = params.pg_sig;
  if (!receivedSig) return false;
  const paramsWithoutSig = { ...params };
  delete paramsWithoutSig.pg_sig;
  const sortedKeys = Object.keys(paramsWithoutSig).sort();
  const parts = [scriptName];
  for (const key of sortedKeys) parts.push(paramsWithoutSig[key]);
  parts.push(secretKey);
  return hexMd5(parts.join(';')) === receivedSig;
}

function xmlResponse(status: string, description: string, secretKey: string): Response {
  const pgSalt = crypto.randomUUID();
  const params: Record<string, string> = { pg_description: description, pg_salt: pgSalt, pg_status: status };
  const sortedKeys = Object.keys(params).sort();
  const parts = ['freedompay-webhook'];
  for (const key of sortedKeys) parts.push(params[key]);
  parts.push(secretKey);
  const pgSig = hexMd5(parts.join(';'));
  const xml = `<?xml version="1.0" encoding="utf-8"?>
<response>
    <pg_status>${status}</pg_status>
    <pg_description>${description}</pg_description>
    <pg_salt>${pgSalt}</pg_salt>
    <pg_sig>${pgSig}</pg_sig>
</response>`;
  return new Response(xml, { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/xml' } });
}

async function extractWebhookPayload(req: Request): Promise<Record<string, string>> {
  const payload: Record<string, string> = {};
  const url = new URL(req.url);
  for (const [key, value] of url.searchParams.entries()) payload[key] = value;
  if (req.method !== 'POST') return payload;
  const contentType = req.headers.get('content-type') || '';
  try {
    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      for (const [key, value] of formData.entries()) {
        if (typeof value === 'string') payload[key] = value;
      }
    } else if (contentType.includes('application/x-www-form-urlencoded')) {
      const bodyText = await req.text();
      for (const [key, value] of new URLSearchParams(bodyText).entries()) payload[key] = value;
    } else if (contentType.includes('application/json')) {
      const body = await req.json() as Record<string, unknown>;
      for (const [key, value] of Object.entries(body)) {
        if (typeof value === 'string') payload[key] = value;
      }
    } else {
      const bodyText = await req.text();
      if (bodyText) {
        for (const [key, value] of new URLSearchParams(bodyText).entries()) payload[key] = value;
      }
    }
  } catch (parseError) {
    console.log('Webhook payload parse error:', parseError);
  }
  return payload;
}

async function sendAdminNotification(
  supabase: any,
  env: Record<string, string>,
  triggerType: string,
  variables: Record<string, string>
): Promise<void> {
  try {
    const { data: template } = await supabase
      .from('auto_notification_templates')
      .select('message_template, is_active')
      .eq('trigger_type', triggerType)
      .eq('is_active', true)
      .maybeSingle();

    if (!template) return;

    const notificationBotToken = Deno.env.get('NOTIFICATION_BOT_TOKEN') || env['NOTIFICATION_BOT_TOKEN'];
    const chatId = Deno.env.get('NOTIFICATION_CHAT_ID') || env['NOTIFICATION_CHAT_ID'];
    if (!notificationBotToken || !chatId) {
      console.error('Notification bot token or chat ID not configured');
      return;
    }

    let message = template.message_template;
    for (const [key, value] of Object.entries(variables)) {
      message = message.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
    }

    await fetch(`https://api.telegram.org/bot${notificationBotToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: 'HTML' }),
    });
  } catch (e) {
    console.error('Admin notification error:', e);
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  let workerEnv: Record<string, string> = {};
  try { workerEnv = JSON.parse(req.headers.get('x-worker-env') || '{}'); } catch { /* ignore */ }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || workerEnv['SUPABASE_URL'];
  const supabasePublicUrl = Deno.env.get('SUPABASE_PUBLIC_URL') || workerEnv['SUPABASE_PUBLIC_URL'] || 'https://api.subday.app';
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || workerEnv['SUPABASE_SERVICE_ROLE_KEY'];
  const secretKey = Deno.env.get('FREEDOMPAY_SECRET_KEY') || workerEnv['FREEDOMPAY_SECRET_KEY'];

  if (!secretKey) {
    return new Response('Payment not configured', { status: 500, headers: corsHeaders });
  }

  const supabase = createClient(supabaseUrl!, supabaseServiceKey!);

  try {
    const payload = await extractWebhookPayload(req);
    console.log('FreedomPay webhook received:', JSON.stringify(payload, null, 2));

    try {
      await supabase.from('webhook_logs').insert({
        source: 'freedompay',
        event_type: payload.pg_result === '1' ? 'success' : (payload.pg_result === '0' ? 'failure' : (payload.pg_result === '2' ? 'pending' : 'unknown')),
        payload: payload as any,
        order_id: payload.pg_order_id || '',
        status: payload.pg_result || '',
      });
    } catch (e) {
      console.error('Webhook log error:', e);
    }

    const orderId = payload.pg_order_id;
    const pgResult = payload.pg_result;
    const pgPaymentId = payload.pg_payment_id;

    if (!orderId) {
      console.error('No pg_order_id in webhook payload');
      return xmlResponse('error', 'Missing order_id', secretKey);
    }

    const isValidSig = verifySignature('freedompay-webhook', payload, secretKey);
    if (!isValidSig) {
      console.error('REJECTED: Invalid signature in webhook for order:', orderId);
      return xmlResponse('error', 'Invalid signature', secretKey);
    }
    console.log('Signature verified OK for order:', orderId);

    const { data: paymentOrder, error: findError } = await supabase
      .from('payment_orders').select('*').eq('order_id', orderId).single();

    if (findError || !paymentOrder) {
      console.error('Payment order not found:', orderId, findError);
      return xmlResponse('error', 'Order not found', secretKey);
    }

    const { data: existingTransaction } = await supabase
      .from('subscription_transactions').select('id')
      .eq('payment_order_id', paymentOrder.id).limit(1).maybeSingle();

    if (paymentOrder.status === 'paid' || existingTransaction) {
      console.log('Order already processed:', orderId);
      return xmlResponse('ok', 'Already processed', secretKey);
    }

    const isSuccess = pgResult === '1';
    const isPending = pgResult === '2';

    if (isPending) {
      await supabase.from('payment_orders').update({
        status: 'pending',
        payment_id: pgPaymentId || paymentOrder.payment_id || null,
      }).eq('id', paymentOrder.id);
      return xmlResponse('ok', 'Payment pending', secretKey);
    }

    if (isSuccess) {
      console.log('Payment successful, activating subscription for user:', paymentOrder.user_id);

      // Атомарный claim: помечаем paid ТОЛЬКО если заказ ещё pending. Если строку
      // уже забрал verify-payment (гонка «вебхук ↔ возврат в приложение») —
      // update вернёт 0 строк, и мы НЕ активируем/не уведомляем повторно.
      // Иначе приходило 2 одинаковых пуша «Подписка активирована».
      const { data: claimedOrder } = await supabase.from('payment_orders').update({
        status: 'paid',
        paid_at: new Date().toISOString(),
        payment_id: pgPaymentId || null,
      }).eq('id', paymentOrder.id).eq('status', 'pending').select('id').maybeSingle();

      if (!claimedOrder) {
        console.log('Order already claimed by another handler (verify-payment):', orderId);
        return xmlResponse('ok', 'Already processed', secretKey);
      }

      const metadata = (paymentOrder.metadata || {}) as Record<string, unknown>;
      const isSpecialOffer = metadata.is_special_offer === true;
      let activationResult: Record<string, unknown>;

      if (isSpecialOffer) {
        console.log('Activating special offer subscription');
        const offerCups = Number(metadata.cups_count) || 7;
        const offerDays = Number(metadata.duration_days) || 7;

        const { data: subType } = await supabase
          .from('subscription_types').select('*').eq('id', paymentOrder.subscription_type_id).single();

        if (!subType) return xmlResponse('error', 'Subscription type not found', secretKey);

        await supabase.from('user_subscriptions').update({ is_active: false })
          .eq('user_id', paymentOrder.user_id).eq('is_active', true)
          .in('subscription_type_id',
            (await supabase.from('subscription_types').select('id').eq('type', subType.type)).data?.map((s: any) => s.id) || []
          );

        const expiresAt = new Date(Date.now() + offerDays * 24 * 60 * 60 * 1000);
        await supabase.from('user_subscriptions').insert({
          user_id: paymentOrder.user_id,
          subscription_type_id: paymentOrder.subscription_type_id,
          started_at: new Date().toISOString(),
          expires_at: expiresAt.toISOString(),
          is_active: true,
          // Дневной лимит стартует заново — можно пить сразу после переподключения.
          daily_limit_reset_at: new Date().toISOString(),
        });
        // Сброс дедупа уведомлений о низком балансе / скором окончании.
        await supabase.from('notification_dedupe_log').delete()
          .eq('user_id', paymentOrder.user_id)
          .or('alert_key.like.low_balance_*,alert_key.like.expiring_soon_*');

        if (subType.type === 'coffee') {
          const { error: statsErr } = await supabase.from('user_stats')
            .update({ coffee_remaining: offerCups, coffee_total: offerCups, updated_at: new Date().toISOString() })
            .eq('user_id', paymentOrder.user_id);
          if (statsErr) {
            await supabase.from('user_stats').insert({ user_id: paymentOrder.user_id, coffee_remaining: offerCups, coffee_total: offerCups });
          }
        } else if (subType.type === 'drinks') {
          const { error: statsErr } = await supabase.from('user_stats')
            .update({ drinks_remaining: offerCups, drinks_total: offerCups, updated_at: new Date().toISOString() })
            .eq('user_id', paymentOrder.user_id);
          if (statsErr) {
            await supabase.from('user_stats').insert({ user_id: paymentOrder.user_id, drinks_remaining: offerCups, drinks_total: offerCups });
          }
        }

        await supabase.from('profiles').update({ special_offer_redeemed_at: new Date().toISOString() })
          .eq('user_id', paymentOrder.user_id);

        // Use applied_offer_id from metadata (set at payment creation time)
        const appliedOfferId = metadata.applied_offer_id as string | null;
        if (appliedOfferId) {
          await supabase.from('user_offer_redemptions').insert({
            user_id: paymentOrder.user_id,
            offer_id: appliedOfferId,
          });
        }

        activationResult = { success: true, cups_count: offerCups, duration_days: offerDays, subscription_name: subType.name };
      } else {
        const { data, error: activationError } = await supabase.rpc('activate_subscription', {
          _user_id: paymentOrder.user_id,
          _subscription_type_id: paymentOrder.subscription_type_id,
        });
        if (activationError) {
          console.error('Subscription activation error:', activationError);
          await supabase.from('webhook_logs').insert({
            source: 'edge', function_name: 'freedompay-webhook',
            level: 'error', event_type: 'activation_failed',
            user_id: paymentOrder.user_id, order_id: orderId,
            status: 'error',
            message: activationError.message ?? String(activationError),
            payload: { subscription_type_id: paymentOrder.subscription_type_id },
          });
          return xmlResponse('error', 'Activation failed', secretKey);
        }
        activationResult = data as Record<string, unknown>;
      }

      console.log('Subscription activated:', activationResult);
      await supabase.from('webhook_logs').insert({
        source: 'edge', function_name: 'freedompay-webhook',
        level: 'info', event_type: 'activation_ok',
        user_id: paymentOrder.user_id, order_id: orderId,
        status: 'ok',
        payload: { subscription_type_id: paymentOrder.subscription_type_id, is_special_offer: isSpecialOffer, ...activationResult },
      });

      const { data: subType } = await supabase.from('subscription_types')
        .select('name, cups_count, duration_days').eq('id', paymentOrder.subscription_type_id).single();

      try {
        await fetch(`${supabasePublicUrl}/functions/v1/send-subscription-notification`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: isSpecialOffer ? 'activated_special' : 'activated',
            userId: paymentOrder.user_id,
            cupsCount: isSpecialOffer ? Number(metadata.cups_count) : (subType?.cups_count || (activationResult as any).cups_count),
            daysCount: isSpecialOffer ? Number(metadata.duration_days) : (subType?.duration_days || (activationResult as any).duration_days),
            subscriptionName: subType?.name,
          }),
        });
      } catch (notifError) {
        console.error('Failed to send user notification:', notifError);
      }

      const receiptData: Record<string, unknown> = {
        payment_id: pgPaymentId || null,
        rrn: null,
        amount: Number(payload.pg_amount) || paymentOrder.amount,
        currency: payload.pg_currency || 'KZT',
        card_last4: payload.pg_card_pan ? payload.pg_card_pan.replace(/[^0-9]/g, '').slice(-4) : null,
        card_brand: payload.pg_card_brand || null,
        issuer_bank: null,
        description: payload.pg_description || null,
        tracking_id: orderId,
        paid_at: payload.pg_payment_date || new Date().toISOString(),
        status: 'successful',
        payment_method: payload.pg_payment_method || 'bankcard',
        card_owner: payload.pg_card_owner || null,
      };

      await supabase.from('subscription_transactions').insert({
        user_id: paymentOrder.user_id,
        subscription_type_id: paymentOrder.subscription_type_id,
        subscription_name: subType?.name || metadata.subscription_name || 'Unknown',
        transaction_type: 'purchase',
        payment_method: 'freedompay',
        amount: paymentOrder.amount,
        payment_order_id: paymentOrder.id,
        is_special_offer: isSpecialOffer,
        receipt_data: receiptData,
      });

      const { data: buyerProfile } = await supabase
        .from('profiles').select('name, phone').eq('user_id', paymentOrder.user_id).maybeSingle();

      const triggerType = isSpecialOffer ? 'admin_payment_special' : 'admin_payment';
      await sendAdminNotification(supabase, workerEnv, triggerType, {
        name: buyerProfile?.name || buyerProfile?.phone || 'Неизвестный',
        subscription_name: subType?.name || 'Unknown',
        amount: String(paymentOrder.amount),
        order_id: orderId,
      });

      return xmlResponse('ok', 'Payment accepted', secretKey);
    } else {
      console.log('Payment not successful, pg_result:', pgResult);
      await supabase.from('payment_orders').update({ status: 'failed' }).eq('id', paymentOrder.id);
      return xmlResponse('ok', 'Payment failure acknowledged', secretKey);
    }
  } catch (error: unknown) {
    console.error('Webhook error:', error);
    return xmlResponse('error', 'Internal error', secretKey);
  }
});
