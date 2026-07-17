// Скан предзаказа (subday_preorder) баристой: валидация + пометка «выдан» +
// падение заказа в POS (iiko/Poster/Rosta) ПО ТАРИФУ ПРЕДЗАКАЗА, на адрес предзаказа.
// Раньше выдача предзаказа делалась клиентски и в POS ничего не уходило — теперь
// единый серверный путь (как обычное списание), доступный и для камеры, и для USB.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { dispatchRedemptionOrder } from '../_shared/pos.ts';
import { setWorkerEnv } from '../_shared/env.ts';

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
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401);

    let workerEnv: Record<string, string> = {};
    try { workerEnv = JSON.parse(req.headers.get('x-worker-env') || '{}'); } catch { /* ignore */ }
    setWorkerEnv(workerEnv); // секреты iiko для диспатча в POS
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || workerEnv['SUPABASE_URL'];
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || workerEnv['SUPABASE_SERVICE_ROLE_KEY'];
    const supabase = createClient(supabaseUrl!, serviceKey!);

    const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
    if (authErr || !user) return json({ error: 'Ошибка авторизации' }, 401);

    const { qrCode, shopId } = await req.json() as { qrCode: string; shopId: string };
    if (!qrCode || !shopId) return json({ error: 'qrCode и shopId обязательны' }, 400);

    // Права: партнёр/бариста ИМЕННО этой кофейни.
    const { data: roles } = await supabase.from('user_roles').select('role, shop_id').eq('user_id', user.id).in('role', ['partner', 'barista']);
    const allowed = (roles || []).map((r: { shop_id: string | null }) => r.shop_id).filter(Boolean);
    if (!allowed.includes(shopId)) return json({ error: 'Нет прав на сканирование в этой кофейне' }, 403);

    // Загрузка + валидация предзаказа.
    const { data: pre } = await supabase.from('preorders')
      .select('id, status, shop_id, shop_address, coffee_name, syrup, subscription_type_id, qr_scanned')
      .eq('qr_code', qrCode).maybeSingle();
    if (!pre) return json({ error: 'Предзаказ не найден' }, 404);
    if (pre.shop_id !== shopId) return json({ error: 'Этот предзаказ для другой кофейни' }, 400);
    if (pre.status === 'cancelled') return json({ error: 'Этот предзаказ отменён' }, 400);
    if (pre.status === 'expired') return json({ error: 'Этот предзаказ закрыт (истёк срок)' }, 400);
    if (pre.status === 'completed' || pre.qr_scanned) return json({ error: 'Этот QR-код уже использован' }, 400);

    // Атомарная выдача (защита от гонки/двойного скана): обновляем только пока qr_scanned=false.
    const { data: updated, error: updErr } = await supabase.from('preorders')
      .update({ status: 'completed', completed_by: user.id, completed_at: new Date().toISOString(), qr_scanned: true })
      .eq('id', pre.id).eq('qr_scanned', false).select('id');
    if (updErr) return json({ error: 'Ошибка при обновлении предзаказа' }, 500);
    if (!updated || updated.length === 0) return json({ error: 'Этот QR-код уже использован' }, 400);

    // Заказ в POS по ТАРИФУ предзаказа, на адрес предзаказа. В фоне — не держим баристу;
    // сбой POS не влияет на выдачу (чашка уже была списана при создании предзаказа).
    // Идемпотентность: redemptionId = preorder.id (UNIQUE в iiko_order_log, без FK).
    if (pre.subscription_type_id) {
      const posOrder = dispatchRedemptionOrder(supabase, {
        redemptionId: pre.id, shopId, address: pre.shop_address, subscriptionTypeId: pre.subscription_type_id,
      }).catch((e) => console.error('preorder POS dispatch error:', e));
      const rt = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime;
      if (rt?.waitUntil) rt.waitUntil(posOrder); else await posOrder;
    }

    const drinkName = pre.syrup ? `${pre.coffee_name} + ${pre.syrup}` : pre.coffee_name;
    return json({ success: true, drinkName, message: 'Предзаказ выдан!' });
  } catch (e) {
    console.error('partner-scan-preorder error:', e);
    return json({ error: e instanceof Error ? e.message : 'Internal error' }, 500);
  }
});
