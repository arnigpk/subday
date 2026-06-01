import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const XPAYMENT_API_URL = 'https://api.xpayment.kz/v1';
const DEFAULT_RETURN_ORIGIN = 'https://web.subday.app';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  let workerEnv: Record<string, string> = {};
  try { workerEnv = JSON.parse(req.headers.get('x-worker-env') || '{}'); } catch { /* ignore */ }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || workerEnv['SUPABASE_URL'];
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || workerEnv['SUPABASE_SERVICE_ROLE_KEY'];
    const xpaymentApiKey = Deno.env.get('XPAYMENT_API_KEY') || workerEnv['XPAYMENT_API_KEY'];
    const xpaymentDeviceId = Deno.env.get('XPAYMENT_DEVICE_ID') || workerEnv['XPAYMENT_DEVICE_ID'];

    if (!supabaseUrl || !supabaseServiceKey) {
      return jsonResponse({ error: 'Backend not configured' }, 500);
    }
    if (!xpaymentApiKey) {
      return jsonResponse({ error: 'Kaspi payment not configured' }, 500);
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return jsonResponse({ error: 'No authorization header' }, 401);
    }

    const supabaseClient = createClient(supabaseUrl, supabaseServiceKey);
    const token = authHeader.replace('Bearer ', '');
    const { data: { user: authUser }, error: authError } = await supabaseClient.auth.getUser(token);

    if (authError || !authUser) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }

    const { subscription_type_id }: { subscription_type_id?: string } = await req.json();

    if (!subscription_type_id) {
      return jsonResponse({ error: 'subscription_type_id is required' }, 400);
    }

    const { data: subscriptionType, error: subError } = await supabaseClient
      .from('subscription_types').select('*').eq('id', subscription_type_id).single();

    if (subError || !subscriptionType) {
      return jsonResponse({ error: 'Subscription type not found' }, 404);
    }

    let finalPrice = subscriptionType.price;
    let finalCups = subscriptionType.cups_count;
    let finalDays = subscriptionType.duration_days;
    let isSpecialOffer = false;
    let appliedOfferId: string | null = null;

    // Check special offers
    const { data: offers } = await supabaseClient
      .from('special_offers').select('*')
      .eq('target_subscription_type_id', subscription_type_id).eq('is_active', true);

    if (offers && offers.length > 0) {
      const [{ data: profile }, { data: allRedemptions }, { data: activeSubs }] = await Promise.all([
        supabaseClient.from('profiles').select('created_at').eq('user_id', authUser.id).single(),
        supabaseClient.from('user_offer_redemptions').select('offer_id').eq('user_id', authUser.id),
        supabaseClient.from('user_subscriptions').select('subscription_type_id, expires_at').eq('user_id', authUser.id).eq('is_active', true),
      ]);

      const redemptionCounts = new Map<string, number>();
      for (const r of allRedemptions || []) {
        redemptionCounts.set(r.offer_id, (redemptionCounts.get(r.offer_id) || 0) + 1);
      }

      const now = new Date();
      for (const offer of offers) {
        const maxRedemptions = offer.max_redemptions_per_user ?? 1;
        if (maxRedemptions > 0 && (redemptionCounts.get(offer.id) || 0) >= maxRedemptions) continue;

        let eligible = false;
        if (offer.eligibility_type === 'new_users') {
          if (profile?.created_at) {
            const eligibleUntil = new Date(new Date(profile.created_at).getTime() + offer.eligibility_days * 86400000);
            eligible = now < eligibleUntil;
          }
        } else if (offer.eligibility_type === 'all_users') {
          eligible = true;
        } else if (offer.eligibility_type === 'no_subscription') {
          eligible = !activeSubs || activeSubs.length === 0;
        } else if (offer.eligibility_type === 'expiring_soon') {
          eligible = (activeSubs || []).some((sub) => {
            if (!sub.expires_at) return false;
            const daysLeft = (new Date(sub.expires_at).getTime() - now.getTime()) / 86400000;
            return daysLeft <= 5 && daysLeft > 0;
          });
        }

        if (eligible) {
          finalPrice = offer.offer_price;
          finalCups = offer.offer_cups_count;
          finalDays = offer.offer_duration_days;
          isSpecialOffer = true;
          appliedOfferId = offer.id;
          break;
        }
      }
    }

    const cleanName = subscriptionType.name.replace(/[^a-zA-Zа-яА-Я0-9]/g, '_').substring(0, 20);
    const orderId = `kaspi_${cleanName}_${Date.now()}`;

    // Create payment order in DB
    const { data: paymentOrder, error: orderError } = await supabaseClient
      .from('payment_orders')
      .insert({
        order_id: orderId,
        user_id: authUser.id,
        subscription_type_id,
        amount: finalPrice,
        status: 'pending',
        metadata: {
          subscription_name: subscriptionType.name,
          cups_count: finalCups,
          duration_days: finalDays,
          is_special_offer: isSpecialOffer,
          applied_offer_id: appliedOfferId,
          payment_method: 'kaspi',
        },
      })
      .select().single();

    if (orderError || !paymentOrder) {
      console.error('Order creation error:', orderError);
      return jsonResponse({ error: 'Failed to create order' }, 500);
    }

    console.log('Creating Kaspi payment link, order:', orderId, 'amount:', finalPrice);

    const xpResponse = await fetch(`${XPAYMENT_API_URL}/payments/link`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${xpaymentApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount: finalPrice,
        merchant_order_id: orderId,
        ...(xpaymentDeviceId ? { device_id: xpaymentDeviceId } : {}),
      }),
    });

    const xpData = await xpResponse.json();
    console.log('xPayment response:', xpResponse.status, JSON.stringify(xpData));

    if (!xpResponse.ok || xpData.error) {
      console.error('xPayment error:', xpData);
      await supabaseClient.from('payment_orders').update({ status: 'failed' }).eq('id', paymentOrder.id);
      return jsonResponse({ error: 'Ошибка создания платежа Kaspi', details: xpData.message }, 500);
    }

    const qrToken = xpData.qr_token;
    const paymentId = xpData.payment_id || null;
    const expireDate = xpData.expire_date || null;

    if (!qrToken) {
      await supabaseClient.from('payment_orders').update({ status: 'failed' }).eq('id', paymentOrder.id);
      return jsonResponse({ error: 'Не получена ссылка на оплату' }, 500);
    }

    await supabaseClient.from('payment_orders')
      .update({ payment_url: qrToken, payment_id: paymentId })
      .eq('id', paymentOrder.id);

    return jsonResponse({
      success: true,
      qr_token: qrToken,
      payment_id: paymentId,
      order_id: orderId,
      amount: finalPrice,
      expire_date: expireDate,
    });
  } catch (error: unknown) {
    console.error('kaspi-create-payment error:', error);
    return jsonResponse({ error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});
