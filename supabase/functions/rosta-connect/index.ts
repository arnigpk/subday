// Кабинетные вызовы Rosta (нужен секретный Bearer-ключ партнёра на сервере).
// Действия: connect (проверка ключа + точки), tradepoints, items, cashboxes,
// payment_methods, users, price_types, test_order.
// Доступ — только партнёр этой кофейни (или админ).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  getTradepoints, getItems, getCashboxes, getPaymentMethods, getUsersFront, getPriceTypes,
  createRostaTestOrder, RostaError,
} from '../_shared/rosta.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    let workerEnv: Record<string, string> = {};
    try { workerEnv = JSON.parse(req.headers.get('x-worker-env') || '{}'); } catch { /* ignore */ }
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || workerEnv['SUPABASE_URL'];
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || workerEnv['SUPABASE_SERVICE_ROLE_KEY'];
    const supabase = createClient(supabaseUrl!, serviceKey!);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401);
    const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
    if (authErr || !user) return json({ error: 'Unauthorized' }, 401);

    const body = await req.json();
    const { action, shopId } = body as { action: string; shopId: string };
    if (!shopId) return json({ error: 'shopId required' }, 400);

    const { data: roles } = await supabase.from('user_roles').select('role, shop_id').eq('user_id', user.id);
    const allowed = (roles || []).some(r => (r.role === 'partner' && r.shop_id === shopId) || r.role === 'admin' || r.role === 'superadmin');
    if (!allowed) return json({ error: 'Нет доступа к этой кофейне' }, 403);

    const loadInteg = async () => {
      const { data } = await supabase.from('rosta_integrations')
        .select('shop_id, api_key, tradepoint_id, price_type_id').eq('shop_id', shopId).maybeSingle();
      return data;
    };

    if (action === 'connect') {
      const apiKey = ((body.apiKey as string) || '').trim();
      if (!apiKey) return json({ error: 'Введите API-ключ Rosta' }, 400);
      const tradepoints = await getTradepoints(apiKey); // валидирует ключ
      await supabase.from('rosta_integrations').upsert({
        shop_id: shopId, api_key: apiKey, updated_at: new Date().toISOString(),
      }, { onConflict: 'shop_id' });
      return json({ success: true, tradepoints });
    }

    const integ = await loadInteg();
    if (!integ) return json({ error: 'Сначала подключите ключ (connect)' }, 400);

    switch (action) {
      case 'tradepoints':
        return json({ success: true, tradepoints: await getTradepoints(integ.api_key) });
      case 'items':
        return json({ success: true, items: await getItems(integ.api_key, integ.price_type_id) });
      case 'cashboxes':
        return json({ success: true, cashboxes: await getCashboxes(integ.api_key) });
      case 'payment_methods':
        return json({ success: true, paymentMethods: await getPaymentMethods(integ.api_key) });
      case 'users':
        return json({ success: true, users: await getUsersFront(integ.api_key) });
      case 'price_types':
        return json({ success: true, priceTypes: await getPriceTypes(integ.api_key) });
      case 'test_order': {
        const r = await createRostaTestOrder(supabase, { shopId, subscriptionTypeId: body.subscriptionTypeId as string });
        return json(r, r.ok ? 200 : 400);
      }
      default:
        return json({ error: 'Unknown action' }, 400);
    }
  } catch (e) {
    const status = e instanceof RostaError ? e.status : 500;
    console.error('rosta-connect error:', e);
    return json({ error: e instanceof Error ? e.message : 'Internal error' }, status);
  }
});
