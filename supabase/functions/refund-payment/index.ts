import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Возврат средств суперадмином. Провайдер определяется по metadata.payment_method:
//   'kaspi' -> xpayment (POST /v1/refunds, Bearer)
//   иначе    -> FreedomPay (POST /revoke.php, подпись MD5)
// Только для роли 'superadmin'. Идемпотентно: повторный возврат уже возвращённого
// заказа отклоняется.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const FREEDOMPAY_REVOKE_URL = 'https://api.freedompay.kz/revoke.php';
// xpayment: возврат по конкретному платежу — POST /v1/payments/{payment_id}/refund,
// тело { amount, reason }. Проверено живым probe'ом (404 PAYMENT_NOT_FOUND на
// фейковом id = эндпоинт/авторизация/тело корректны).
const XPAYMENT_BASE_URL = 'https://api.xpayment.kz/v1';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// Pure JS MD5 — без WASM (self-hosted edge-runtime не грузит deno.land/std/crypto).
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

// Подпись FreedomPay: md5(scriptName;sorted_param_values;secretKey)
function fpSignature(scriptName: string, params: Record<string, string>, secretKey: string): string {
  const sortedKeys = Object.keys(params).sort();
  const parts = [scriptName, ...sortedKeys.map(k => params[k]), secretKey];
  return hexMd5(parts.join(';'));
}

function parseXml(xml: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /<(pg_[a-z_0-9]+)>([\s\S]*?)<\/\1>/gi;
  let m;
  while ((m = re.exec(xml)) !== null) out[m[1]] = m[2].trim();
  return out;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  let workerEnv: Record<string, string> = {};
  try { workerEnv = JSON.parse(req.headers.get('x-worker-env') || '{}'); } catch { /* ignore */ }
  const env = (k: string) => Deno.env.get(k) || workerEnv[k];

  try {
    const supabaseUrl = env('SUPABASE_URL');
    const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceKey) return jsonResponse({ error: 'Backend not configured' }, 500);
    const supabase = createClient(supabaseUrl, serviceKey);

    // --- Авторизация: только superadmin ---
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return jsonResponse({ error: 'Unauthorized' }, 401);
    const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
    if (authErr || !user) return jsonResponse({ error: 'Unauthorized' }, 401);

    const { data: roleRow } = await supabase
      .from('user_roles').select('role').eq('user_id', user.id).eq('role', 'superadmin').maybeSingle();
    if (!roleRow) return jsonResponse({ error: 'Superadmin access required' }, 403);

    // --- Заказ ---
    const { payment_order_id } = await req.json();
    if (!payment_order_id) return jsonResponse({ error: 'payment_order_id required' }, 400);

    const { data: order, error: orderErr } = await supabase
      .from('payment_orders').select('*').eq('id', payment_order_id).single();
    if (orderErr || !order) return jsonResponse({ error: 'Order not found' }, 404);

    if (order.status === 'refunded') return jsonResponse({ error: 'Уже возвращён' }, 409);
    if (order.status !== 'paid') return jsonResponse({ error: 'Возврат возможен только для оплаченного заказа' }, 409);
    if (!order.payment_id) return jsonResponse({ error: 'Нет payment_id провайдера — возврат невозможен' }, 409);

    const metadata = (order.metadata || {}) as Record<string, unknown>;
    const isKaspi = metadata.payment_method === 'kaspi';
    const amount = Number(order.amount);

    let providerResult: Record<string, unknown> = {};
    let refundOk = false;
    let refundId: string | null = null;

    if (isKaspi) {
      // --- xpayment (Kaspi): POST /v1/refunds, Bearer ---
      const apiKey = env('XPAYMENT_API_KEY');
      if (!apiKey) return jsonResponse({ error: 'XPAYMENT_API_KEY не настроен' }, 500);
      const refundUrl = `${XPAYMENT_BASE_URL}/payments/${encodeURIComponent(String(order.payment_id))}/refund`;
      const resp = await fetch(refundUrl, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount, reason: 'Возврат средств (суперадмин)' }),
      });
      const data = await resp.json().catch(() => ({}));
      providerResult = { http: resp.status, ...data };
      // Успех: 2xx, нет error и нет fail_reason (у xpayment объект возврата содержит fail_reason при ошибке).
      refundOk = resp.ok && !data?.error && !data?.fail_reason;
      refundId = data?.id || data?.refund_id || String(order.payment_id);
      if (!refundOk) {
        console.error('xpayment refund failed:', resp.status, JSON.stringify(data));
        return jsonResponse({ error: 'Kaspi отказал в возврате', details: data?.message || data?.error || data?.fail_reason || `HTTP ${resp.status}`, providerResult }, 502);
      }
    } else {
      // --- FreedomPay: POST /revoke.php, подпись MD5 ---
      const merchantId = env('FREEDOMPAY_MERCHANT_ID');
      const secretKey = env('FREEDOMPAY_SECRET_KEY');
      if (!merchantId || !secretKey) return jsonResponse({ error: 'FreedomPay не настроен' }, 500);

      const pgParams: Record<string, string> = {
        pg_merchant_id: merchantId,
        pg_payment_id: String(order.payment_id),
        pg_refund_amount: String(amount), // полный возврат = сумма заказа
        pg_salt: crypto.randomUUID().replace(/-/g, ''),
      };
      pgParams.pg_sig = fpSignature('revoke.php', pgParams, secretKey);

      const form = new URLSearchParams(pgParams);
      const resp = await fetch(FREEDOMPAY_REVOKE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form.toString(),
      });
      const xml = await resp.text();
      const parsed = parseXml(xml);
      providerResult = { http: resp.status, ...parsed };
      refundOk = parsed.pg_status === 'ok';
      refundId = parsed.pg_payment_id || String(order.payment_id);
      if (!refundOk) {
        console.error('FreedomPay revoke failed:', resp.status, xml);
        return jsonResponse({ error: 'FreedomPay отказал в возврате', details: parsed.pg_error_description || parsed.pg_status || `HTTP ${resp.status}`, providerResult }, 502);
      }
    }

    // --- Успех: помечаем заказ возвращённым ---
    const refundInfo = {
      provider: isKaspi ? 'xpayment' : 'freedompay',
      amount,
      refund_id: refundId,
      refunded_at: new Date().toISOString(),
      refunded_by: user.id,
      provider_result: providerResult,
    };
    await supabase.from('payment_orders')
      .update({ status: 'refunded', metadata: { ...metadata, refund: refundInfo } })
      .eq('id', order.id);

    // Уведомление разработчику
    const botToken = env('NOTIFICATION_BOT_TOKEN');
    const chatId = env('NOTIFICATION_CHAT_ID');
    if (botToken && chatId) {
      const text = `💸 Возврат средств\nПровайдер: ${isKaspi ? 'Kaspi (xpayment)' : 'FreedomPay'}\nСумма: ${amount} ₸\nЗаказ: ${order.order_id}\nВыполнил суперадмин.`;
      fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text }),
      }).catch(() => {});
    }

    return jsonResponse({ success: true, provider: refundInfo.provider, amount, refund_id: refundId });
  } catch (err) {
    console.error('refund-payment error:', err);
    return jsonResponse({ error: err instanceof Error ? err.message : 'Unknown error' }, 500);
  }
});
