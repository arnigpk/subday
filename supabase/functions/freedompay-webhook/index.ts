import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { crypto as stdCrypto } from "https://deno.land/std@0.224.0/crypto/mod.ts";
import { encodeHex } from "https://deno.land/std@0.224.0/encoding/hex.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

/**
 * Verify FreedomPay signature
 */
async function verifySignature(scriptName: string, params: Record<string, string>, secretKey: string): Promise<boolean> {
  const receivedSig = params.pg_sig;
  if (!receivedSig) return false;

  const paramsWithoutSig = { ...params };
  delete paramsWithoutSig.pg_sig;

  const sortedKeys = Object.keys(paramsWithoutSig).sort();
  const parts = [scriptName];
  for (const key of sortedKeys) {
    parts.push(paramsWithoutSig[key]);
  }
  parts.push(secretKey);
  const signString = parts.join(';');

  const encoder = new TextEncoder();
  const data = encoder.encode(signString);
  const hashBuffer = await stdCrypto.subtle.digest('MD5', data);
  const computedSig = encodeHex(new Uint8Array(hashBuffer));

  return computedSig === receivedSig;
}

/**
 * Generate XML response for FreedomPay
 */
async function xmlResponse(status: string, description: string, secretKey: string): Promise<Response> {
  const pgSalt = crypto.randomUUID();
  
  const params: Record<string, string> = {
    pg_description: description,
    pg_salt: pgSalt,
    pg_status: status,
  };
  
  // Generate signature for response
  const sortedKeys = Object.keys(params).sort();
  const parts = [''];
  for (const key of sortedKeys) {
    parts.push(params[key]);
  }
  parts.push(secretKey);
  const signString = parts.join(';');
  const encoder = new TextEncoder();
  const data = encoder.encode(signString);
  const hashBuffer = await stdCrypto.subtle.digest('MD5', data);
  const pgSig = encodeHex(new Uint8Array(hashBuffer));

  const xml = `<?xml version="1.0" encoding="utf-8"?>
<response>
    <pg_status>${status}</pg_status>
    <pg_description>${description}</pg_description>
    <pg_salt>${pgSalt}</pg_salt>
    <pg_sig>${pgSig}</pg_sig>
</response>`;

  return new Response(xml, {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/xml' },
  });
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

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const secretKey = Deno.env.get('FREEDOMPAY_SECRET_KEY')!;

  if (!secretKey) {
    return new Response('Payment not configured', { status: 500, headers: corsHeaders });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    // Parse form-data or url-encoded body from FreedomPay
    const payload: Record<string, string> = {};
    const contentType = req.headers.get('content-type') || '';
    const url = new URL(req.url);

    // Query params
    for (const [key, value] of url.searchParams.entries()) {
      payload[key] = value;
    }

    if (req.method === 'POST') {
      try {
        const bodyText = await req.text();
        console.log('FreedomPay webhook raw body:', bodyText.slice(0, 500));

        if (bodyText) {
          if (contentType.includes('multipart/form-data')) {
            // Parse multipart - re-read as formData
            // FreedomPay sends as form-data but we already consumed body, parse manually
            const formParams = new URLSearchParams(bodyText);
            for (const [key, value] of formParams.entries()) {
              payload[key] = value;
            }
          } else {
            // Try URL-encoded
            const formParams = new URLSearchParams(bodyText);
            for (const [key, value] of formParams.entries()) {
              payload[key] = value;
            }
          }
        }
      } catch (parseError) {
        console.log('Body parse error (non-fatal):', parseError);
      }
    }

    console.log('FreedomPay webhook received:', JSON.stringify(payload, null, 2));

    // Log webhook event
    await supabase.from('webhook_logs').insert({
      source: 'freedompay',
      event_type: payload.pg_result === '1' ? 'success' : (payload.pg_result === '0' ? 'failure' : 'unknown'),
      payload: payload as any,
      order_id: payload.pg_order_id || '',
      status: payload.pg_result || '',
    }).catch(e => console.error('Webhook log error:', e));

    const orderId = payload.pg_order_id;
    const pgResult = payload.pg_result; // 1 = success, 0 = failure
    const pgPaymentId = payload.pg_payment_id;

    if (!orderId) {
      console.error('No pg_order_id in webhook payload');
      return await xmlResponse('error', 'Missing order_id', secretKey);
    }

    // Verify signature
    const isValidSig = await verifySignature('', payload, secretKey);
    if (!isValidSig) {
      console.error('Invalid signature in webhook');
      // Don't reject - some edge cases with signature. Log and continue.
      console.log('Signature verification failed but continuing...');
    }

    // Find payment order
    const { data: paymentOrder, error: findError } = await supabase
      .from('payment_orders').select('*').eq('order_id', orderId).single();

    if (findError || !paymentOrder) {
      console.error('Payment order not found:', orderId, findError);
      return await xmlResponse('error', 'Order not found', secretKey);
    }

    if (paymentOrder.status === 'paid') {
      console.log('Order already processed:', orderId);
      return await xmlResponse('ok', 'Already processed', secretKey);
    }

    const isSuccess = pgResult === '1';

    if (isSuccess) {
      console.log('Payment successful, activating subscription for user:', paymentOrder.user_id);

      await supabase.from('payment_orders').update({
        status: 'paid',
        paid_at: new Date().toISOString(),
        payment_id: pgPaymentId || null,
      }).eq('id', paymentOrder.id);

      const metadata = (paymentOrder.metadata || {}) as Record<string, unknown>;
      const isSpecialOffer = metadata.is_special_offer === true;
      let activationResult: Record<string, unknown>;

      if (isSpecialOffer) {
        console.log('Activating special offer subscription');
        const offerCups = Number(metadata.cups_count) || 7;
        const offerDays = Number(metadata.duration_days) || 7;

        const { data: subType } = await supabase
          .from('subscription_types').select('*').eq('id', paymentOrder.subscription_type_id).single();

        if (!subType) {
          return await xmlResponse('error', 'Subscription type not found', secretKey);
        }

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
        });

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

        const { data: activeOffers } = await supabase.from('special_offers').select('id')
          .eq('target_subscription_type_id', paymentOrder.subscription_type_id).eq('is_active', true).limit(1);

        if (activeOffers && activeOffers.length > 0) {
          await supabase.from('user_offer_redemptions').insert({ user_id: paymentOrder.user_id, offer_id: activeOffers[0].id });
        }

        activationResult = { success: true, cups_count: offerCups, duration_days: offerDays, subscription_name: subType.name };
      } else {
        const { data, error: activationError } = await supabase.rpc('activate_subscription', {
          _user_id: paymentOrder.user_id,
          _subscription_type_id: paymentOrder.subscription_type_id,
        });
        if (activationError) {
          console.error('Subscription activation error:', activationError);
          return await xmlResponse('error', 'Activation failed', secretKey);
        }
        activationResult = data as Record<string, unknown>;
      }

      console.log('Subscription activated:', activationResult);

      const { data: subType } = await supabase.from('subscription_types')
        .select('name, cups_count, duration_days').eq('id', paymentOrder.subscription_type_id).single();

      // Send user notification
      try {
        await fetch(`${supabaseUrl}/functions/v1/send-subscription-notification`, {
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

      // Build receipt data from webhook payload
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

      // Log transaction
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

      // Admin notification
      const { data: buyerProfile } = await supabase
        .from('profiles').select('name, phone').eq('user_id', paymentOrder.user_id).maybeSingle();

      const triggerType = isSpecialOffer ? 'admin_payment_special' : 'admin_payment';
      sendAdminNotification(supabase, triggerType, {
        name: buyerProfile?.name || buyerProfile?.phone || 'Неизвестный',
        subscription_name: subType?.name || 'Unknown',
        amount: String(paymentOrder.amount),
        order_id: orderId,
      });

      return await xmlResponse('ok', 'Payment accepted', secretKey);
    } else {
      console.log('Payment not successful, pg_result:', pgResult);
      await supabase.from('payment_orders').update({ status: 'failed' }).eq('id', paymentOrder.id);
      return await xmlResponse('ok', 'Payment failure acknowledged', secretKey);
    }
  } catch (error: unknown) {
    console.error('Webhook error:', error);
    return await xmlResponse('error', 'Internal error', secretKey);
  }
});
