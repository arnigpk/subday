import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
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

  if (!supabaseUrl || !supabaseServiceKey) {
    return jsonResponse({ error: 'Backend not configured' }, 500);
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const body = await req.json();
    console.log('xPayment webhook received:', JSON.stringify(body));

    const event = body.event as string;
    const payment = body.payment || body;
    const merchantOrderId = payment.merchant_order_id || body.merchant_order_id;
    const paymentId = payment.payment_id || body.payment_id;
    const amount = payment.amount || body.amount;

    // Log webhook
    try {
      await supabase.from('webhook_logs').insert({
        source: 'xpayment',
        event_type: event || 'unknown',
        payload: body,
        order_id: merchantOrderId || '',
        status: event || '',
      });
    } catch (e) {
      console.error('Webhook log error:', e);
    }

    if (!merchantOrderId) {
      console.error('No merchant_order_id in webhook');
      return jsonResponse({ ok: true });
    }

    if (event !== 'payment.completed') {
      console.log('Non-completion event, skipping:', event);
      return jsonResponse({ ok: true });
    }

    // Find payment order
    const { data: paymentOrder, error: findError } = await supabase
      .from('payment_orders').select('*').eq('order_id', merchantOrderId).single();

    if (findError || !paymentOrder) {
      console.error('Payment order not found:', merchantOrderId);
      return jsonResponse({ ok: true });
    }

    // Idempotency check
    const { data: existingTransaction } = await supabase
      .from('subscription_transactions').select('id')
      .eq('payment_order_id', paymentOrder.id).limit(1).maybeSingle();

    if (paymentOrder.status === 'paid' || existingTransaction) {
      console.log('Order already processed:', merchantOrderId);
      return jsonResponse({ ok: true });
    }

    console.log('Payment completed, activating subscription for user:', paymentOrder.user_id);

    // Атомарный claim: помечаем paid только если заказ ещё pending — защита от
    // повторной активации/уведомления при гонке (двойная доставка вебхука и т.п.).
    const { data: claimedOrder } = await supabase.from('payment_orders').update({
      status: 'paid',
      paid_at: new Date().toISOString(),
      payment_id: paymentId || null,
    }).eq('id', paymentOrder.id).eq('status', 'pending').select('id').maybeSingle();

    if (!claimedOrder) {
      console.log('Order already claimed by another handler:', merchantOrderId);
      return jsonResponse({ ok: true });
    }

    const metadata = (paymentOrder.metadata || {}) as Record<string, unknown>;
    const isSpecialOffer = metadata.is_special_offer === true;
    let activationResult: Record<string, unknown>;

    if (isSpecialOffer) {
      const offerCups = Number(metadata.cups_count) || 7;
      const offerDays = Number(metadata.duration_days) || 7;

      const { data: subType } = await supabase
        .from('subscription_types').select('*').eq('id', paymentOrder.subscription_type_id).single();

      if (!subType) {
        return jsonResponse({ error: 'Subscription type not found' }, 500);
      }

      await supabase.from('user_subscriptions').update({ is_active: false })
        .eq('user_id', paymentOrder.user_id).eq('is_active', true)
        .in('subscription_type_id',
          (await supabase.from('subscription_types').select('id').eq('type', subType.type)).data?.map((s: any) => s.id) || []
        );

      const expiresAt = new Date(Date.now() + offerDays * 86400000);
      await supabase.from('user_subscriptions').insert({
        user_id: paymentOrder.user_id,
        subscription_type_id: paymentOrder.subscription_type_id,
        started_at: new Date().toISOString(),
        expires_at: expiresAt.toISOString(),
        is_active: true,
        daily_limit_reset_at: new Date().toISOString(),
      });
      await supabase.from('notification_dedupe_log').delete()
        .eq('user_id', paymentOrder.user_id)
        .or('alert_key.like.low_balance_*,alert_key.like.expiring_soon_*');

      if (subType.type === 'coffee') {
        const { error: statsErr } = await supabase.from('user_stats')
          .update({ coffee_remaining: offerCups, coffee_total: offerCups, updated_at: new Date().toISOString() })
          .eq('user_id', paymentOrder.user_id);
        if (statsErr) await supabase.from('user_stats').insert({ user_id: paymentOrder.user_id, coffee_remaining: offerCups, coffee_total: offerCups });
      } else if (subType.type === 'drinks') {
        const { error: statsErr } = await supabase.from('user_stats')
          .update({ drinks_remaining: offerCups, drinks_total: offerCups, updated_at: new Date().toISOString() })
          .eq('user_id', paymentOrder.user_id);
        if (statsErr) await supabase.from('user_stats').insert({ user_id: paymentOrder.user_id, drinks_remaining: offerCups, drinks_total: offerCups });
      }

      await supabase.from('profiles').update({ special_offer_redeemed_at: new Date().toISOString() })
        .eq('user_id', paymentOrder.user_id);

      const appliedOfferId = metadata.applied_offer_id as string | null;
      if (appliedOfferId) {
        await supabase.from('user_offer_redemptions').insert({ user_id: paymentOrder.user_id, offer_id: appliedOfferId });
      }

      activationResult = { success: true, cups_count: offerCups, duration_days: offerDays };
    } else {
      const { data, error: activationError } = await supabase.rpc('activate_subscription', {
        _user_id: paymentOrder.user_id,
        _subscription_type_id: paymentOrder.subscription_type_id,
      });
      if (activationError) {
        console.error('Activation error:', activationError);
        return jsonResponse({ error: 'Activation failed' }, 500);
      }
      activationResult = data as Record<string, unknown>;
    }

    const { data: subType } = await supabase.from('subscription_types')
      .select('name, cups_count, duration_days').eq('id', paymentOrder.subscription_type_id).single();

    // User push notification
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
    } catch (e) {
      console.error('User notification error:', e);
    }

    // Log transaction
    await supabase.from('subscription_transactions').insert({
      user_id: paymentOrder.user_id,
      subscription_type_id: paymentOrder.subscription_type_id,
      subscription_name: subType?.name || metadata.subscription_name || 'Unknown',
      transaction_type: 'purchase',
      payment_method: 'kaspi',
      amount: paymentOrder.amount,
      payment_order_id: paymentOrder.id,
      is_special_offer: isSpecialOffer,
      receipt_data: { payment_id: paymentId, amount, status: 'successful', payment_method: 'kaspi' },
    });

    // Admin notification
    const { data: buyerProfile } = await supabase
      .from('profiles').select('name, phone').eq('user_id', paymentOrder.user_id).maybeSingle();

    await sendAdminNotification(supabase, workerEnv, isSpecialOffer ? 'admin_payment_special' : 'admin_payment', {
      name: buyerProfile?.name || buyerProfile?.phone || 'Неизвестный',
      subscription_name: subType?.name || 'Unknown',
      amount: String(paymentOrder.amount),
      order_id: merchantOrderId,
    });

    console.log('Kaspi payment processed successfully:', merchantOrderId);
    return jsonResponse({ ok: true });
  } catch (error: unknown) {
    console.error('xpayment-webhook error:', error);
    return jsonResponse({ error: 'Internal error' }, 500);
  }
});
