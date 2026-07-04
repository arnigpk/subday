import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const FREEDOMPAY_API_URL = 'https://api.freedompay.kz';
const DEFAULT_RETURN_ORIGIN = 'https://web.subday.app';

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

// Для НАТИВНОГО приложения возвращаемся на страницу-«отскок» на публичном веб-домене,
// которая перебрасывает в приложение по deep-link subday://pay. Оверлей оплаты
// (Custom Tabs / SFSafariViewController) закрывается, приложение показывает результат.
function buildNativeReturnUrl(returnPath: string | undefined, status: 'success' | 'failed', orderId: string) {
  const normalizedPath = returnPath && returnPath.startsWith('/') ? returnPath : '/packages';
  const url = new URL('/pay-return', DEFAULT_RETURN_ORIGIN);
  url.searchParams.set('status', status);
  url.searchParams.set('order', orderId);
  url.searchParams.set('path', normalizedPath);
  return url.toString();
}

function getClientIp(req: Request) {
  const forwardedFor = req.headers.get('x-forwarded-for');
  if (!forwardedFor) return undefined;
  return forwardedFor.split(',')[0]?.trim() || undefined;
}

// Pure JS MD5 — no WASM, works in Deno edge runtime
function hexMd5(str: string): string {
  // Convert to UTF-8 bytes so Cyrillic chars hash correctly
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

/**
 * Generate FreedomPay signature.
 * Signature = md5(scriptName;sorted_param_values;secretKey)
 */
function generateSignature(scriptName: string, params: Record<string, string>, secretKey: string): string {
  const sortedKeys = Object.keys(params).sort();
  const parts = [scriptName];
  for (const key of sortedKeys) parts.push(params[key]);
  parts.push(secretKey);
  return hexMd5(parts.join(';'));
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

  let workerEnv: Record<string, string> = {};
  try { workerEnv = JSON.parse(req.headers.get('x-worker-env') || '{}'); } catch { /* ignore */ }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || workerEnv['SUPABASE_URL'];
    const supabasePublicUrl = Deno.env.get('SUPABASE_PUBLIC_URL') || workerEnv['SUPABASE_PUBLIC_URL'] || 'https://api.subday.app';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || workerEnv['SUPABASE_SERVICE_ROLE_KEY'];
    const merchantId = Deno.env.get('FREEDOMPAY_MERCHANT_ID') || workerEnv['FREEDOMPAY_MERCHANT_ID'];
    const secretKey = Deno.env.get('FREEDOMPAY_SECRET_KEY') || workerEnv['FREEDOMPAY_SECRET_KEY'];

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

    const { subscription_type_id, return_path, native }: { subscription_type_id?: string; return_path?: string; native?: boolean } = await req.json();

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
    let appliedOfferId: string | null = null;

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
          appliedOfferId = offer.id;
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
          applied_offer_id: appliedOfferId,
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
      pg_result_url: `${supabasePublicUrl}/functions/v1/freedompay-webhook`,
      pg_success_url: native
        ? buildNativeReturnUrl(return_path, 'success', orderId)
        : buildReturnUrl(appOrigin, return_path, 'success', orderId),
      pg_success_url_method: 'GET',
      pg_failure_url: native
        ? buildNativeReturnUrl(return_path, 'failed', orderId)
        : buildReturnUrl(appOrigin, return_path, 'failed', orderId),
      pg_failure_url_method: 'GET',
      pg_user_id: authUser.id,
      pg_payment_route: 'frame',
    };

    if (cleanPhone) pgParams.pg_user_phone = cleanPhone;
    if (authUser.email) pgParams.pg_user_contact_email = authUser.email;
    const clientIp = getClientIp(req);
    if (clientIp) pgParams.pg_user_ip = clientIp;

    pgParams.pg_sig = generateSignature('init_payment.php', pgParams, secretKey);

    const formData = new FormData();
    for (const [key, value] of Object.entries(pgParams)) formData.append(key, value);

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

    await supabaseClient
      .from('payment_orders')
      .update({ payment_url: paymentUrl, payment_id: paymentId || null })
      .eq('id', paymentOrder.id);

    return jsonResponse({
      success: true,
      payment_url: paymentUrl,
      payment_id: paymentId,
      order_id: orderId,
      redirect_url_type: parsed.pg_redirect_url_type || 'redirect',
    });
  } catch (error: unknown) {
    console.error('create-payment error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return jsonResponse({ error: message }, 500);
  }
});
