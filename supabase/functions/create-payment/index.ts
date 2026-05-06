import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { crypto as stdCrypto } from "https://deno.land/std@0.224.0/crypto/mod.ts";
import { encodeHex } from "https://deno.land/std@0.224.0/encoding/hex.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const FREEDOMPAY_API_URL = 'https://api.freedompay.kz';
const DEFAULT_RETURN_ORIGIN = 'https://web.subday.app';

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

function detectAppOrigin(req: Request) {
  const originHeader = req.headers.get('origin');
  if (originHeader) return originHeader;
  const refererHeader = req.headers.get('referer');
  if (refererHeader) {
    try { return new URL(refererHeader).origin; } catch { return DEFAULT_RETURN_ORIGIN; }
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

function getClientIp(req: Request) {
  const forwardedFor = req.headers.get('x-forwarded-for');
  if (!forwardedFor) return undefined;
  return forwardedFor.split(',')[0]?.trim() || undefined;
}

/**
 * Generate FreedomPay signature.
 * Signature = md5(scriptName;sorted_param_values;secretKey)
 * Params sorted alphabetically by key name, values joined with ;
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
 * Parse XML response from FreedomPay into a flat key-value object
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
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const merchantId = Deno.env.get('FREEDOMPAY_MERCHANT_ID');
    const secretKey = Deno.env.get('FREEDOMPAY_SECRET_KEY');

    if (!supabaseUrl || !supabaseServiceKey) {
      return jsonResponse({ error: 'Backend not configured' }, 500);
    }
    if (!merchantId || !secretKey) {
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

    // Check special offers
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
        },
      })
      .select()
      .single();

    if (orderError || !paymentOrder) {
      console.error('Order creation error:', orderError);
      return jsonResponse({ error: 'Failed to create order' }, 500);
    }

    // Get user profile for contact info
    const { data: userProfile } = await supabaseClient
      .from('profiles')
      .select('phone, name')
      .eq('user_id', authUser.id)
      .single();

    const cleanPhone = userProfile?.phone?.replace(/\D/g, '') || '';
    const appOrigin = detectAppOrigin(req);
    const description = `Подписка: ${subscriptionType.name}`.slice(0, 50);

    // Build FreedomPay init_payment params
    const pgSalt = crypto.randomUUID();
    const pgParams: Record<string, string> = {
      pg_merchant_id: merchantId,
      pg_order_id: orderId,
      pg_amount: String(finalPrice),
      pg_currency: 'KZT',
      pg_description: description,
      pg_salt: pgSalt,
      pg_language: 'ru',
      pg_request_method: 'POST',
      pg_result_url: `${supabaseUrl}/functions/v1/freedompay-webhook`,
      pg_success_url: buildReturnUrl(appOrigin, return_path, 'success', orderId),
      pg_success_url_method: 'GET',
      pg_failure_url: buildReturnUrl(appOrigin, return_path, 'failed', orderId),
      pg_failure_url_method: 'GET',
      pg_idempotency_key: orderId,
      pg_user_id: authUser.id,
      pg_payment_route: 'frame',
    };

    if (cleanPhone) {
      pgParams.pg_user_phone = cleanPhone;
    }
    if (authUser.email) {
      pgParams.pg_user_contact_email = authUser.email;
    }
    const clientIp = getClientIp(req);
    if (clientIp) {
      pgParams.pg_user_ip = clientIp;
    }

    // Generate signature
    const scriptName = 'init_payment.php';
    pgParams.pg_sig = await generateSignature(scriptName, pgParams, secretKey);

    // Send request to FreedomPay using multipart/form-data as per docs
    const formData = new FormData();
    for (const [key, value] of Object.entries(pgParams)) {
      formData.append(key, value);
    }

    console.log('Sending init_payment to FreedomPay, order:', orderId, 'merchant:', merchantId);

    const fpResponse = await fetch(`${FREEDOMPAY_API_URL}/init_payment.php`, {
      method: 'POST',
      body: formData,
    });

    const responseText = await fpResponse.text();
    console.log('FreedomPay response:', responseText.slice(0, 500));

    if (!fpResponse.ok) {
      console.error('FreedomPay HTTP error:', fpResponse.status);
      await supabaseClient.from('payment_orders').update({ status: 'failed' }).eq('id', paymentOrder.id);
      return jsonResponse({ error: 'Payment creation failed', details: responseText.slice(0, 200) }, 500);
    }

    const parsed = parseXmlResponse(responseText);

    if (parsed.pg_status === 'error') {
      console.error('FreedomPay error:', parsed.pg_error_description || parsed);
      await supabaseClient.from('payment_orders').update({ status: 'failed' }).eq('id', paymentOrder.id);
      return jsonResponse({ error: 'Payment creation failed', details: parsed.pg_error_description || 'Unknown error' }, 500);
    }

    const paymentUrl = parsed.pg_redirect_url;
    const paymentId = parsed.pg_payment_id;

    if (!paymentUrl) {
      console.error('No redirect URL in FreedomPay response:', parsed);
      await supabaseClient.from('payment_orders').update({ status: 'failed' }).eq('id', paymentOrder.id);
      return jsonResponse({ error: 'No payment URL received' }, 500);
    }

    // Update payment order with FreedomPay payment_id
    await supabaseClient
      .from('payment_orders')
      .update({
        payment_url: paymentUrl,
        payment_id: paymentId || null,
      })
      .eq('id', paymentOrder.id);

    return jsonResponse({
      success: true,
      payment_url: paymentUrl,
      payment_id: paymentId,
      order_id: orderId,
    });
  } catch (error: unknown) {
    console.error('create-payment error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return jsonResponse({ error: message }, 500);
  }
});
