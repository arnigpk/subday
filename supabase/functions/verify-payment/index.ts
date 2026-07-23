import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendAdminNotification } from "../_shared/adminNotify.ts";

// Pure JS MD5 — без WASM. Self-hosted edge-runtime не умеет грузить
// deno.land/std/crypto (WASM), из-за чего функция раньше падала с worker boot
// error. Реализация 1:1 совпадает с freedompay-webhook (проверенная подпись).
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

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const FREEDOMPAY_API_URL = 'https://api.freedompay.kz';
const FREEDOMPAY_STATUS_URL = `${FREEDOMPAY_API_URL}/g2g/status_v2`;

type JsonRecord = Record<string, unknown>;

function decodeXmlEntities(value: string) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/**
 * Generate FreedomPay signature
 */
async function generateSignature(scriptName: string, params: Record<string, string>, secretKey: string): Promise<string> {
  const sortedKeys = Object.keys(params).sort();
  const parts = [scriptName];
  for (const key of sortedKeys) {
    parts.push(params[key]);
  }
  parts.push(secretKey);
  return hexMd5(parts.join(';'));
}

/**
 * Parse XML response from FreedomPay
 */
function parseXmlResponse(xml: string): Record<string, string> {
  const result: Record<string, string> = {};
  const tagRegex = /<(pg_[a-z_0-9]+)>([\s\S]*?)<\/\1>/gi;
  let match;
  while ((match = tagRegex.exec(xml)) !== null) {
    result[match[1]] = decodeXmlEntities(match[2].trim());
  }
  return result;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    let workerEnv: Record<string, string> = {};
    try { workerEnv = JSON.parse(req.headers.get('x-worker-env') || '{}'); } catch { /* ignore */ }
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || workerEnv['SUPABASE_URL'];
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || workerEnv['SUPABASE_SERVICE_ROLE_KEY'];
    const merchantId = Deno.env.get('FREEDOMPAY_MERCHANT_ID') || workerEnv['FREEDOMPAY_MERCHANT_ID'];
    const secretKey = Deno.env.get('FREEDOMPAY_SECRET_KEY') || workerEnv['FREEDOMPAY_SECRET_KEY'];

    if (!supabaseUrl || !supabaseServiceKey) {
      return jsonResponse({ error: 'Backend not configured' }, 500);
    }
    if (!merchantId || !secretKey) {
      return jsonResponse({ error: 'Payment verification not configured' }, 500);
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return jsonResponse({ error: 'No authorization header' }, 401);
    }

    let requestBody: { order_id?: string } = {};
    try {
      requestBody = await req.json();
    } catch {
      requestBody = {};
    }

    const requestedOrderId = typeof requestBody.order_id === 'string' && requestBody.order_id.trim()
      ? requestBody.order_id.trim()
      : null;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const token = authHeader.replace('Bearer ', '');
    const { data: { user: authUser }, error: claimsError } = await supabase.auth.getUser(token);

    if (claimsError || !authUser) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }

    // Find pending order
    let pendingOrderQuery = supabase
      .from('payment_orders')
      .select('*')
      .eq('user_id', authUser.id)
      .eq('status', 'pending');

    if (requestedOrderId) {
      pendingOrderQuery = pendingOrderQuery.eq('order_id', requestedOrderId);
    }

    const { data: pendingOrder, error: findError } = await pendingOrderQuery
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (findError) {
      console.error('Pending order lookup error:', findError);
    }

    if (!pendingOrder) {
      // Check if already paid
      let paidOrderQuery = supabase
        .from('payment_orders')
        .select('*')
        .eq('user_id', authUser.id)
        .eq('status', 'paid');

      if (requestedOrderId) {
        paidOrderQuery = paidOrderQuery.eq('order_id', requestedOrderId);
      }

      const { data: recentPaid } = await paidOrderQuery
        .order('paid_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (recentPaid) {
        return jsonResponse({ success: true, message: 'Already activated by webhook' });
      }

      return jsonResponse({ success: false, message: 'No pending orders found' });
    }

    const paymentId = pendingOrder.payment_id;
    if (!paymentId) {
      return jsonResponse({ success: false, message: 'Payment ID missing for this order', order_id: pendingOrder.order_id });
    }

    // Check status via FreedomPay status_v2
    const pgSalt = crypto.randomUUID();
    const statusParams: Record<string, string> = {
      pg_merchant_id: merchantId,
      pg_payment_id: paymentId,
      pg_order_id: pendingOrder.order_id,
      pg_salt: pgSalt,
    };
    statusParams.pg_sig = await generateSignature('status_v2', statusParams, secretKey);

    const formData = new FormData();
    for (const [key, value] of Object.entries(statusParams)) {
      formData.append(key, value);
    }

    const statusResponse = await fetch(FREEDOMPAY_STATUS_URL, {
      method: 'POST',
      body: formData,
    });

    const responseText = await statusResponse.text();
    console.log('FreedomPay status response:', responseText.slice(0, 500));

    if (!statusResponse.ok || !responseText) {
      return jsonResponse({ success: false, message: 'Payment not confirmed yet', order_id: pendingOrder.order_id });
    }

    const statusData = parseXmlResponse(responseText);
    const requestStatus = (statusData.pg_status || '').toLowerCase();
    if (requestStatus && requestStatus !== 'ok') {
      console.error('FreedomPay status request failed:', statusData);
      return jsonResponse({
        success: false,
        message: statusData.pg_failure_description || statusData.pg_error_description || 'Payment status request failed',
        order_id: pendingOrder.order_id,
      });
    }

    const paymentStatus = (statusData.pg_payment_status || '').toLowerCase();

    const SUCCESS_STATUSES = ['success', 'ok', 'paid'];
    const FAILURE_STATUSES = ['failed', 'failure', 'error', 'expired', 'cancelled', 'canceled', 'declined', 'rejected'];
    const PENDING_STATUSES = ['pending', 'processing', 'process', 'incomplete', 'not_completed', 'new', 'wait', 'waiting'];

    const isPaymentSuccessful = SUCCESS_STATUSES.includes(paymentStatus);
    const isPaymentFailed = FAILURE_STATUSES.includes(paymentStatus);
    const isPaymentPending = !paymentStatus || PENDING_STATUSES.includes(paymentStatus);

    if (isPaymentFailed) {
      await supabase
        .from('payment_orders')
        .update({ status: 'failed', payment_id: paymentId })
        .eq('id', pendingOrder.id)
        .eq('status', 'pending');

      return jsonResponse({ success: false, message: 'Payment failed', order_id: pendingOrder.order_id });
    }

    if (isPaymentPending) {
      return jsonResponse({ success: false, message: 'Payment not confirmed yet', order_id: pendingOrder.order_id });
    }

    if (!isPaymentSuccessful) {
      return jsonResponse({ success: false, message: 'Payment not confirmed yet', order_id: pendingOrder.order_id });
    }

    // Atomically mark as paid
    const { data: updatedOrder, error: updateError } = await supabase
      .from('payment_orders')
      .update({ status: 'paid', paid_at: new Date().toISOString(), payment_id: paymentId })
      .eq('id', pendingOrder.id)
      .eq('status', 'pending')
      .select()
      .maybeSingle();

    if (updateError) {
      console.error('Order update error:', updateError);
    }

    if (!updatedOrder) {
      return jsonResponse({ success: true, message: 'Already activated' });
    }

    // Activate subscription
    const metadata = (pendingOrder.metadata || {}) as Record<string, unknown>;
    const isSpecialOffer = metadata.is_special_offer === true;
    let activationResult: Record<string, unknown>;

    if (isSpecialOffer) {
      const offerCups = Number(metadata.cups_count) || 7;
      const offerDays = Number(metadata.duration_days) || 7;

      const { data: subType } = await supabase
        .from('subscription_types').select('*').eq('id', pendingOrder.subscription_type_id).single();

      if (!subType) {
        return jsonResponse({ error: 'Subscription type not found' }, 500);
      }

      await supabase.from('user_subscriptions').update({ is_active: false })
        .eq('user_id', authUser.id).eq('is_active', true)
        .in('subscription_type_id',
          (await supabase.from('subscription_types').select('id').eq('type', subType.type)).data?.map((s: any) => s.id) || []
        );

      const expiresAt = new Date(Date.now() + offerDays * 24 * 60 * 60 * 1000);
      await supabase.from('user_subscriptions').insert({
        user_id: authUser.id,
        subscription_type_id: pendingOrder.subscription_type_id,
        started_at: new Date().toISOString(),
        expires_at: expiresAt.toISOString(),
        is_active: true,
        // Дневной лимит стартует заново — можно пить сразу после переподключения.
        daily_limit_reset_at: new Date().toISOString(),
      });
      // Сброс дедупа уведомлений о низком балансе / скором окончании.
      await supabase.from('notification_dedupe_log').delete()
        .eq('user_id', authUser.id)
        .or('alert_key.like.low_balance_*,alert_key.like.expiring_soon_*');

      if (subType.type === 'coffee') {
        const { error: statsErr } = await supabase.from('user_stats')
          .update({ coffee_remaining: offerCups, coffee_total: offerCups, updated_at: new Date().toISOString() })
          .eq('user_id', authUser.id);
        if (statsErr) {
          await supabase.from('user_stats').insert({ user_id: authUser.id, coffee_remaining: offerCups, coffee_total: offerCups });
        }
      } else if (subType.type === 'drinks') {
        const { error: statsErr } = await supabase.from('user_stats')
          .update({ drinks_remaining: offerCups, drinks_total: offerCups, updated_at: new Date().toISOString() })
          .eq('user_id', authUser.id);
        if (statsErr) {
          await supabase.from('user_stats').insert({ user_id: authUser.id, drinks_remaining: offerCups, drinks_total: offerCups });
        }
      }

      await supabase.from('profiles').update({ special_offer_redeemed_at: new Date().toISOString() })
        .eq('user_id', authUser.id);

      const { data: activeOffers } = await supabase.from('special_offers').select('id')
        .eq('target_subscription_type_id', pendingOrder.subscription_type_id).eq('is_active', true).limit(1);

      if (activeOffers && activeOffers.length > 0) {
        await supabase.from('user_offer_redemptions').insert({ user_id: authUser.id, offer_id: activeOffers[0].id });
      }

      activationResult = { success: true, cups_count: offerCups, duration_days: offerDays, subscription_name: subType.name };
    } else {
      const { data, error: activationError } = await supabase.rpc('activate_subscription', {
        _user_id: authUser.id,
        _subscription_type_id: pendingOrder.subscription_type_id,
        _source: isSpecialOffer ? 'purchase_special' : 'purchase',
      });

      if (activationError) {
        console.error('Activation error:', activationError);
        return jsonResponse({ error: 'Activation failed' }, 500);
      }

      activationResult = data as Record<string, unknown>;
    }

    const { data: subType } = await supabase.from('subscription_types')
      .select('name, cups_count, duration_days').eq('id', pendingOrder.subscription_type_id).single();

    // Send user notification
    try {
      await fetch(`${supabaseUrl}/functions/v1/send-subscription-notification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: isSpecialOffer ? 'activated_special' : 'activated',
          userId: authUser.id,
          cupsCount: isSpecialOffer ? Number(metadata.cups_count) : (subType?.cups_count || (activationResult as any).cups_count),
          daysCount: isSpecialOffer ? Number(metadata.duration_days) : (subType?.duration_days || (activationResult as any).duration_days),
          subscriptionName: subType?.name,
        }),
      });
    } catch (notifError) {
      console.error('Failed to send user notification:', notifError);
    }

    // Build receipt from status response
    const receiptData = {
      payment_id: paymentId,
      rrn: statusData.pg_reference || null,
      amount: Number(statusData.pg_amount) || pendingOrder.amount,
      currency: statusData.pg_currency || 'KZT',
      card_last4: statusData.pg_card_pan ? statusData.pg_card_pan.replace(/[^0-9]/g, '').slice(-4) : null,
      card_brand: null,
      issuer_bank: null,
      description: null,
      tracking_id: pendingOrder.order_id,
      paid_at: statusData.pg_payment_date || new Date().toISOString(),
      status: 'successful',
      payment_method: statusData.pg_payment_method || 'bankcard',
      card_owner: statusData.pg_card_name || null,
    };

    await supabase.from('subscription_transactions').insert({
      user_id: authUser.id,
      subscription_type_id: pendingOrder.subscription_type_id,
      subscription_name: subType?.name || metadata.subscription_name || 'Unknown',
      transaction_type: 'purchase',
      payment_method: 'freedompay',
      amount: pendingOrder.amount,
      payment_order_id: pendingOrder.id,
      is_special_offer: isSpecialOffer,
      receipt_data: receiptData,
    });

    // Admin notification
    const { data: buyerProfile } = await supabase
      .from('profiles').select('name, phone').eq('user_id', authUser.id).maybeSingle();

    const triggerType = isSpecialOffer ? 'admin_payment_special' : 'admin_payment';
    await sendAdminNotification(supabase, workerEnv, triggerType, {
      name: buyerProfile?.name || buyerProfile?.phone || 'Неизвестный',
      subscription_name: subType?.name || 'Unknown',
      amount: String(pendingOrder.amount),
      order_id: pendingOrder.order_id,
    });

    return jsonResponse({ success: true, message: 'Subscription activated', activation: activationResult });
  } catch (error: unknown) {
    console.error('Verify payment error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return jsonResponse({ error: message }, 500);
  }
});
