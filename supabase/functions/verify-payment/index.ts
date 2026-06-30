import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { crypto as stdCrypto } from "https://deno.land/std@0.224.0/crypto/mod.ts";
import { encodeHex } from "https://deno.land/std@0.224.0/encoding/hex.ts";

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
  const signString = parts.join(';');
  const encoder = new TextEncoder();
  const data = encoder.encode(signString);
  const hashBuffer = await stdCrypto.subtle.digest('MD5', data);
  return encodeHex(new Uint8Array(hashBuffer));
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
    if (!notificationBotToken || !chatId) return;

    let message = template.message_template;
    for (const [key, value] of Object.entries(variables)) {
      message = message.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
    }

    await fetch(`https://api.telegram.org/bot${notificationBotToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: 'HTML' })
    });
  } catch (e) {
    console.error('Admin notification error:', e);
  }
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
      });

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
