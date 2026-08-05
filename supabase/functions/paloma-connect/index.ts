// Кабинетные вызовы Paloma365 (нужны секретные authkey + class партнёра на сервере).
// Действия: connect (проверка ключа/класса + точки), points, menu, test_order, sync_statuses.
// Доступ — только партнёр этой кофейни (или админ).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getPoints, getMenu, createPalomaTestOrder, syncPalomaStatuses, PalomaError } from '../_shared/paloma.ts';

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
    const address = ((body.address as string) ?? '') || ''; // '' = дефолт-интеграция кофейни

    const { data: roles } = await supabase.from('user_roles').select('role, shop_id').eq('user_id', user.id);
    const allowed = (roles || []).some(r => (r.role === 'partner' && r.shop_id === shopId) || r.role === 'admin' || r.role === 'superadmin');
    if (!allowed) return json({ error: 'Нет доступа к этой кофейне' }, 403);

    const loadInteg = async () => {
      const { data } = await supabase.from('paloma_integrations')
        .select('shop_id, api_key, connector_class, point_id').eq('shop_id', shopId).eq('address', address).maybeSingle();
      return data;
    };

    if (action === 'connect') {
      const apiKey = ((body.apiKey as string) || '').trim();
      const connectorClass = ((body.connectorClass as string) || '').trim();
      if (!apiKey) return json({ error: 'Введите authkey Paloma' }, 400);
      if (!connectorClass) return json({ error: 'Введите класс коннектора Paloma' }, 400);
      const points = await getPoints(apiKey, connectorClass); // валидирует ключ+класс
      await supabase.from('paloma_integrations').upsert({
        shop_id: shopId, address, api_key: apiKey, connector_class: connectorClass, updated_at: new Date().toISOString(),
      }, { onConflict: 'shop_id,address' });
      return json({ success: true, points });
    }

    const integ = await loadInteg();
    if (!integ) return json({ error: 'Сначала подключите ключ (connect)' }, 400);
    if (!integ.connector_class) return json({ error: 'Не задан класс коннектора' }, 400);

    switch (action) {
      case 'points':
        return json({ success: true, points: await getPoints(integ.api_key, integ.connector_class) });
      case 'menu':
        return json({ success: true, items: await getMenu(integ.api_key, integ.connector_class, integ.point_id || '') });
      case 'test_order': {
        const r = await createPalomaTestOrder(supabase, { shopId, subscriptionTypeId: body.subscriptionTypeId as string, integrationAddress: address });
        return json(r, r.ok ? 200 : 400);
      }
      case 'sync_statuses': {
        await syncPalomaStatuses(supabase, shopId, address);
        return json({ success: true });
      }
      default:
        return json({ error: 'Unknown action' }, 400);
    }
  } catch (e) {
    const status = e instanceof PalomaError ? e.status : 500;
    console.error('paloma-connect error:', e);
    return json({ error: e instanceof Error ? e.message : 'Internal error' }, status);
  }
});
