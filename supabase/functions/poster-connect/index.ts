// Кабинетные вызовы Poster (нужен секретный токен партнёра на сервере).
// Действия: connect (проверка токена + точки), spots, products, test_order.
// Доступ — только партнёр этой кофейни (или админ).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getSpots, getProducts, createPosterTestOrder, PosterError } from '../_shared/poster.ts';

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
      const { data } = await supabase.from('poster_integrations')
        .select('shop_id, api_token, account_name, spot_id, currency, auto_close, is_active').eq('shop_id', shopId).maybeSingle();
      return data;
    };

    if (action === 'connect') {
      const apiToken = ((body.apiToken as string) || '').trim();
      if (!apiToken) return json({ error: 'Введите токен Poster (формат account:hash)' }, 400);
      const spots = await getSpots(apiToken); // валидирует токен
      const accountName = apiToken.split(':')[0] || null;
      await supabase.from('poster_integrations').upsert({
        shop_id: shopId, api_token: apiToken, account_name: accountName, updated_at: new Date().toISOString(),
      }, { onConflict: 'shop_id' });
      return json({ success: true, spots });
    }

    const integ = await loadInteg();
    if (!integ) return json({ error: 'Сначала подключите токен (connect)' }, 400);

    switch (action) {
      case 'spots':
        return json({ success: true, spots: await getSpots(integ.api_token) });
      case 'products': {
        const spotId = (body.spotId as string) || integ.spot_id;
        if (!spotId) return json({ error: 'Не выбрана точка (spot)' }, 400);
        return json({ success: true, products: await getProducts(integ.api_token, spotId) });
      }
      case 'test_order': {
        const r = await createPosterTestOrder(supabase, { shopId, subscriptionTypeId: body.subscriptionTypeId as string });
        return json(r, r.ok ? 200 : 400);
      }
      default:
        return json({ error: 'Unknown action' }, 400);
    }
  } catch (e) {
    const status = e instanceof PosterError ? e.status : 500;
    console.error('poster-connect error:', e);
    return json({ error: e instanceof Error ? e.message : 'Internal error' }, status);
  }
});
