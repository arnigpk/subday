import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const PAYLINK_BASE_URL = 'https://core.paylink.kz/api/v1';
const SUCCESS_STATUSES = ['successful', 'success', 'paid', 'completed', 'approved', 'authorized', 'captured'];
const FAILURE_STATUSES = ['failed', 'error', 'expired', 'cancelled', 'canceled', 'declined'];

type JsonRecord = Record<string, unknown>;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function extractInvoiceUid(paymentId: string | null, paymentUrl: string | null) {
  if (paymentId) return paymentId;
  if (!paymentUrl) return null;

  try {
    const url = new URL(paymentUrl);
    const segments = url.pathname.split('/').filter(Boolean);
    return segments[segments.length - 1] || null;
  } catch {
    return null;
  }
}

function collectStatuses(invoice: JsonRecord) {
  const transaction = (invoice.transaction || {}) as JsonRecord;
  return [invoice.status, invoice.transactionStatus, transaction.status]
    .filter((value): value is string => typeof value === 'string')
    .map((value) => value.toLowerCase());
}

function buildReceiptData(invoice: JsonRecord, fallbackAmount: number, trackingId: string) {
  const transaction = (invoice.transaction || {}) as JsonRecord;
  const cardInfo = (invoice.cardInfo || {}) as JsonRecord;

  return {
    payment_id: String(transaction.uid || invoice.uid || ''),
    invoice_uid: String(invoice.uid || ''),
    rrn: transaction.rrn || invoice.rrn || null,
    amount: Number(invoice.amount ?? fallbackAmount),
    commission_amount: Number(invoice.commissionAmount ?? 0),
    currency: String(invoice.currency || 'KZT'),
    card_last4: cardInfo.last4 ? String(cardInfo.last4) : null,
    card_brand: cardInfo.brand ? String(cardInfo.brand) : null,
    issuer_bank: cardInfo.issuerBank ? String(cardInfo.issuerBank) : null,
    description: invoice.description ? String(invoice.description) : null,
    tracking_id: trackingId,
    paid_at: new Date().toISOString(),
    status: 'successful',
  };
}

async function sendAdminNotification(
  supabase: any,
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

    const notificationBotToken = Deno.env.get('NOTIFICATION_BOT_TOKEN');
    const chatId = Deno.env.get('NOTIFICATION_CHAT_ID');
    if (!notificationBotToken || !chatId) return;

    let message = template.message_template;
    for (const [key, value] of Object.entries(variables)) {
      message = message.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
    }

    fetch(`https://api.telegram.org/bot${notificationBotToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: 'HTML' })
    }).catch(e => console.error('Notification failed:', e));
  } catch (e) {
    console.error('Admin notification error:', e);
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const paylinkApiKey = Deno.env.get('PAYLINK_API_KEY');

    if (!supabaseUrl || !supabaseServiceKey) {
      return jsonResponse({ error: 'Backend not configured' }, 500);
    }

    if (!paylinkApiKey) {
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

    const invoiceUid = extractInvoiceUid(pendingOrder.payment_id, pendingOrder.payment_url);
    if (!invoiceUid) {
      return jsonResponse({ success: false, message: 'Invoice UID is missing for this order', order_id: pendingOrder.order_id });
    }

    const statusResponse = await fetch(`${PAYLINK_BASE_URL}/invoices/${invoiceUid}`, {
      method: 'GET',
      headers: { 'X-API-KEY': paylinkApiKey, 'Accept': 'application/json' },
    });

    const responseText = await statusResponse.text();
    if (!statusResponse.ok || !responseText) {
      return jsonResponse({ success: false, message: 'Payment not confirmed yet', order_id: pendingOrder.order_id });
    }

    let invoiceData: JsonRecord = {};
    try {
      invoiceData = JSON.parse(responseText);
    } catch {
      return jsonResponse({ success: false, message: 'Payment not confirmed yet', order_id: pendingOrder.order_id });
    }

    const statuses = collectStatuses(invoiceData);
    const isPaymentSuccessful = statuses.some((status) => SUCCESS_STATUSES.includes(status));
    const isPaymentFailed = statuses.some((status) => FAILURE_STATUSES.includes(status));

    if (isPaymentFailed) {
      await supabase
        .from('payment_orders')
        .update({ status: 'failed', payment_id: invoiceUid })
        .eq('id', pendingOrder.id)
        .eq('status', 'pending');

      return jsonResponse({ success: false, message: 'Payment failed', order_id: pendingOrder.order_id });
    }

    if (!isPaymentSuccessful) {
      return jsonResponse({ success: false, message: 'Payment not confirmed yet', order_id: pendingOrder.order_id });
    }

    const { data: updatedOrder, error: updateError } = await supabase
      .from('payment_orders')
      .update({ status: 'paid', paid_at: new Date().toISOString(), payment_id: invoiceUid })
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
          (await supabase.from('subscription_types').select('id').eq('type', subType.type)).data?.map(s => s.id) || []
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

    const receiptData = buildReceiptData(invoiceData, pendingOrder.amount, pendingOrder.order_id);

    await supabase.from('subscription_transactions').insert({
      user_id: authUser.id,
      subscription_type_id: pendingOrder.subscription_type_id,
      subscription_name: subType?.name || metadata.subscription_name || 'Unknown',
      transaction_type: 'purchase',
      payment_method: 'paylink',
      amount: pendingOrder.amount,
      payment_order_id: pendingOrder.id,
      is_special_offer: isSpecialOffer,
      receipt_data: receiptData,
    });

    const { data: buyerProfile } = await supabase
      .from('profiles').select('name, phone').eq('user_id', authUser.id).maybeSingle();

    const triggerType = isSpecialOffer ? 'admin_payment_special' : 'admin_payment';
    sendAdminNotification(supabase, triggerType, {
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