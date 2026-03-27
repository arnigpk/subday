import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const PAYLINK_BASE_URL = 'https://core.paylink.kz/api/v1';
const DEFAULT_RETURN_ORIGIN = 'https://vhod.lovable.app';

type JsonRecord = Record<string, unknown>;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function detectAppOrigin(req: Request) {
  const originHeader = req.headers.get('origin');
  if (originHeader) return originHeader;

  const refererHeader = req.headers.get('referer');
  if (refererHeader) {
    try {
      return new URL(refererHeader).origin;
    } catch {
      return DEFAULT_RETURN_ORIGIN;
    }
  }

  return DEFAULT_RETURN_ORIGIN;
}

function buildReturnUrl(origin: string, returnPath: string | undefined, status: 'success' | 'failed', orderId: string) {
  const normalizedPath = returnPath && returnPath.startsWith('/') ? returnPath : '/packages';
  const url = new URL(normalizedPath, origin);
  url.searchParams.set('payment', status);
  url.searchParams.set('order', orderId);
  return url.toString();
}

function extractInvoiceUid(paylinkResponse: JsonRecord, paymentUrl?: string | null) {
  const directUid = paylinkResponse.uid || paylinkResponse.invoiceUid || paylinkResponse.invoice_id || paylinkResponse.id;
  if (typeof directUid === 'string' && directUid.trim()) {
    return directUid;
  }

  if (!paymentUrl) return null;

  try {
    const url = new URL(paymentUrl);
    const segments = url.pathname.split('/').filter(Boolean);
    return segments[segments.length - 1] || null;
  } catch {
    return null;
  }
}

function getClientIp(req: Request) {
  const forwardedFor = req.headers.get('x-forwarded-for');
  if (!forwardedFor) return undefined;
  return forwardedFor.split(',')[0]?.trim() || undefined;
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
      return jsonResponse({ error: 'Payment not configured' }, 500);
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return jsonResponse({ error: 'No authorization header' }, 401);
    }

    const supabaseClient = createClient(supabaseUrl, supabaseServiceKey);
    const token = authHeader.replace('Bearer ', '');
    const { data: { user: authUser }, error: authError } = await supabaseClient.auth.getUser(token);

    if (authError || !authUser) {
      console.error('Auth error:', authError);
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }

    const { subscription_type_id, return_path }: { subscription_type_id?: string; return_path?: string } = await req.json();

    if (!subscription_type_id) {
      return jsonResponse({ error: 'subscription_type_id is required' }, 400);
    }

    const { data: subscriptionType, error: subError } = await supabaseClient
      .from('subscription_types')
      .select('*')
      .eq('id', subscription_type_id)
      .single();

    if (subError || !subscriptionType) {
      console.error('Subscription type error:', subError);
      return jsonResponse({ error: 'Subscription type not found' }, 404);
    }

    let finalPrice = subscriptionType.price;
    let finalCups = subscriptionType.cups_count;
    let finalDays = subscriptionType.duration_days;
    let isSpecialOffer = false;

    const { data: offers } = await supabaseClient
      .from('special_offers')
      .select('*')
      .eq('target_subscription_type_id', subscription_type_id)
      .eq('is_active', true);

    if (offers && offers.length > 0) {
      const [{ data: profile }, { data: allRedemptions }, { data: activeSubs }] = await Promise.all([
        supabaseClient.from('profiles').select('created_at').eq('user_id', authUser.id).single(),
        supabaseClient.from('user_offer_redemptions').select('offer_id').eq('user_id', authUser.id),
        supabaseClient.from('user_subscriptions').select('subscription_type_id, expires_at').eq('user_id', authUser.id).eq('is_active', true),
      ]);

      const redemptionCounts = new Map<string, number>();
      for (const redemption of allRedemptions || []) {
        redemptionCounts.set(redemption.offer_id, (redemptionCounts.get(redemption.offer_id) || 0) + 1);
      }

      const now = new Date();
      for (const offer of offers) {
        const maxRedemptions = offer.max_redemptions_per_user ?? 1;
        const userRedemptions = redemptionCounts.get(offer.id) || 0;
        if (maxRedemptions > 0 && userRedemptions >= maxRedemptions) continue;

        let eligible = false;
        if (offer.eligibility_type === 'new_users') {
          if (profile?.created_at) {
            const createdAt = new Date(profile.created_at);
            const eligibleUntil = new Date(createdAt.getTime() + offer.eligibility_days * 24 * 60 * 60 * 1000);
            eligible = now < eligibleUntil;
          }
        } else if (offer.eligibility_type === 'all_users') {
          eligible = true;
        } else if (offer.eligibility_type === 'no_subscription') {
          eligible = !activeSubs || activeSubs.length === 0;
        } else if (offer.eligibility_type === 'expiring_soon') {
          eligible = (activeSubs || []).some((sub) => {
            if (!sub.expires_at) return false;
            const expiresAt = new Date(sub.expires_at);
            const daysLeft = (expiresAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000);
            return daysLeft <= 5 && daysLeft > 0;
          });
        }

        if (eligible) {
          finalPrice = offer.offer_price;
          finalCups = offer.offer_cups_count;
          finalDays = offer.offer_duration_days;
          isSpecialOffer = true;
          break;
        }
      }
    }

    const cleanName = subscriptionType.name.replace(/[^a-zA-Zа-яА-Я0-9]/g, '_').substring(0, 20);
    const orderId = `${cleanName}_${Date.now()}`;

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
        },
      })
      .select()
      .single();

    if (orderError || !paymentOrder) {
      console.error('Order creation error:', orderError);
      return jsonResponse({ error: 'Failed to create order' }, 500);
    }

    const { data: profile } = await supabaseClient
      .from('profiles')
      .select('phone, name')
      .eq('user_id', authUser.id)
      .single();

    const cleanPhone = profile?.phone?.replace(/\D/g, '') || '';
    const formattedPhone = cleanPhone.startsWith('7') ? cleanPhone : `7${cleanPhone}`;
    const customerName = profile?.name || 'Клиент';
    const [firstName = 'Клиент', ...restName] = customerName.split(' ');
    const lastName = restName.join(' ');
    const appOrigin = detectAppOrigin(req);
    const description = `Подписка: ${subscriptionType.name}`.slice(0, 50);

    const paylinkPayload = {
      amount: finalPrice,
      currency: 'KZT',
      requestId: crypto.randomUUID(),
      trackingId: orderId,
      description,
      callbackUrl: `${supabaseUrl}/functions/v1/paylink-webhook`,
      successUrl: buildReturnUrl(appOrigin, return_path, 'success', orderId),
      failureUrl: buildReturnUrl(appOrigin, return_path, 'failed', orderId),
      customFields: {
        user_id: authUser.id,
        subscription_type_id,
        payment_order_id: paymentOrder.id,
      },
      customer: {
        id: authUser.id,
        firstName,
        lastName,
        phone: formattedPhone ? (formattedPhone.startsWith('+') ? formattedPhone : `+${formattedPhone}`) : undefined,
        email: authUser.email || `user_${authUser.id.substring(0, 8)}@subday.app`,
        language: 'RU',
        ip: getClientIp(req),
      },
      transactionType: 'PAYMENT',
      doTokenize: false,
    };

    const paylinkResponse = await fetch(`${PAYLINK_BASE_URL}/invoices`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'X-API-KEY': paylinkApiKey,
      },
      body: JSON.stringify(paylinkPayload),
    });

    const responseText = await paylinkResponse.text();
    let paylinkData: JsonRecord = {};

    if (responseText) {
      try {
        paylinkData = JSON.parse(responseText);
      } catch {
        await supabaseClient.from('payment_orders').update({ status: 'failed' }).eq('id', paymentOrder.id);
        return jsonResponse({ error: 'Invalid response from payment provider', details: responseText.slice(0, 200) }, 500);
      }
    }

    if (!paylinkResponse.ok || paylinkData.error || paylinkData.errors) {
      console.error('Paylink create invoice error:', paylinkData);
      await supabaseClient.from('payment_orders').update({ status: 'failed' }).eq('id', paymentOrder.id);
      return jsonResponse({ error: 'Payment creation failed', details: paylinkData }, 500);
    }

    const paymentUrl = typeof paylinkData.paymentUrl === 'string'
      ? paylinkData.paymentUrl
      : typeof paylinkData.payment_url === 'string'
        ? paylinkData.payment_url
        : null;

    const invoiceUid = extractInvoiceUid(paylinkData, paymentUrl);

    if (!paymentUrl) {
      console.error('No paymentUrl in Paylink response:', paylinkData);
      await supabaseClient.from('payment_orders').update({ status: 'failed' }).eq('id', paymentOrder.id);
      return jsonResponse({ error: 'No payment URL received', response: paylinkData }, 500);
    }

    await supabaseClient
      .from('payment_orders')
      .update({
        payment_url: paymentUrl,
        payment_id: invoiceUid,
      })
      .eq('id', paymentOrder.id);

    return jsonResponse({
      success: true,
      payment_url: paymentUrl,
      payment_id: invoiceUid,
      order_id: orderId,
    });
  } catch (error: unknown) {
    console.error('create-payment error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return jsonResponse({ error: message }, 500);
  }
});