// Кабинетные вызовы iiko (нужен секрет api_login на сервере).
// Действия: connect (проверка ключа + организации), terminals (+ типы заказа),
// payment_types, products. Доступ — только партнёр этой кофейни (или админ).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  iikoAuth, getValidToken, getOrganizations, getTerminalGroups,
  getOrderTypes, getPaymentTypes, getProducts, IikoError,
} from '../_shared/iiko.ts';

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
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) return json({ error: 'Unauthorized' }, 401);

    const body = await req.json();
    const { action, shopId } = body as { action: string; shopId: string };
    if (!shopId) return json({ error: 'shopId required' }, 400);

    // Доступ: партнёр этой кофейни или админ/суперадмин.
    const [{ data: roles }] = await Promise.all([
      supabase.from('user_roles').select('role, shop_id').eq('user_id', user.id),
    ]);
    const isPartnerOfShop = (roles || []).some(r => r.role === 'partner' && r.shop_id === shopId);
    const isAdmin = (roles || []).some(r => r.role === 'admin' || r.role === 'superadmin');
    if (!isPartnerOfShop && !isAdmin) return json({ error: 'Нет доступа к этой кофейне' }, 403);

    const loadInteg = async () => {
      const { data } = await supabase.from('iiko_integrations')
        .select('shop_id, api_login, app_id, api_key, client_secret, organization_id, payment_type_id, payment_type_kind, auto_close, is_active, access_token, token_expires_at')
        .eq('shop_id', shopId).maybeSingle();
      return data;
    };

    if (action === 'connect') {
      // Две схемы: простой apiLogin (v1) ИЛИ appId+apiKey+clientSecret (v2).
      const apiLogin = ((body.apiLogin as string) || '').trim();
      const appId = ((body.appId as string) || '').trim();
      const apiKey = ((body.apiKey as string) || '').trim();
      const clientSecret = ((body.clientSecret as string) || '').trim();
      const isV2 = !!(appId && apiKey && clientSecret);
      if (!apiLogin && !isV2) return json({ error: 'Введите apiLogin (или appId + apiKey + clientSecret для ключа нового формата)' }, 400);

      const creds = isV2 ? { app_id: appId, api_key: apiKey, client_secret: clientSecret } : { api_login: apiLogin };
      const iikoToken = await iikoAuth(creds);
      const orgs = await getOrganizations(iikoToken);
      // сохраняем учётные данные + токен (интеграция пока не активна)
      await supabase.from('iiko_integrations').upsert({
        shop_id: shopId,
        api_login: isV2 ? null : apiLogin,
        app_id: isV2 ? appId : null,
        api_key: isV2 ? apiKey : null,
        client_secret: isV2 ? clientSecret : null,
        access_token: iikoToken,
        token_expires_at: new Date(Date.now() + 55 * 60 * 1000).toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'shop_id' });
      return json({ success: true, organizations: orgs });
    }

    const integ = await loadInteg();
    if (!integ) return json({ error: 'Сначала подключите ключ (connect)' }, 400);
    const orgId = (body.organizationId as string) || integ.organization_id;
    if (!orgId && action !== 'organizations') return json({ error: 'Не выбрана организация' }, 400);
    const iikoToken = await getValidToken(supabase, integ);

    switch (action) {
      case 'organizations':
        return json({ success: true, organizations: await getOrganizations(iikoToken) });
      case 'terminals': {
        const [terminals, orderTypes] = await Promise.all([
          getTerminalGroups(iikoToken, orgId!),
          getOrderTypes(iikoToken, orgId!),
        ]);
        return json({ success: true, terminals, orderTypes });
      }
      case 'payment_types':
        return json({ success: true, paymentTypes: await getPaymentTypes(iikoToken, orgId!) });
      case 'products':
        return json({ success: true, products: await getProducts(iikoToken, orgId!) });
      default:
        return json({ error: 'Unknown action' }, 400);
    }
  } catch (e) {
    const status = e instanceof IikoError ? e.status : 500;
    console.error('iiko-connect error:', e);
    return json({ error: e instanceof Error ? e.message : 'Internal error' }, status);
  }
});
