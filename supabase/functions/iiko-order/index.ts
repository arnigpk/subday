// Кабинет: повтор неудавшегося заказа и отмена заказа (iiko ИЛИ Poster — по провайдеру строки).
// Доступ — только партнёр кофейни, к которой относится заказ (или админ).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { IikoError } from '../_shared/iiko.ts';
import { retryPosOrder, cancelPosOrder } from '../_shared/pos.ts';

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

    const { action, logId } = await req.json() as { action: string; logId: string };
    if (!logId) return json({ error: 'logId required' }, 400);

    const { data: log } = await supabase.from('iiko_order_log')
      .select('id, redemption_id, shop_id, address, integration_address, subscription_type_id, provider, organization_id, iiko_order_id, pos_order_id, status')
      .eq('id', logId).maybeSingle();
    if (!log) return json({ error: 'Заказ не найден' }, 404);

    // Доступ к кофейне заказа
    const { data: roles } = await supabase.from('user_roles').select('role, shop_id').eq('user_id', user.id);
    const ok = (roles || []).some(r => (r.role === 'partner' && r.shop_id === log.shop_id) || r.role === 'admin' || r.role === 'superadmin');
    if (!ok) return json({ error: 'Нет доступа' }, 403);

    if (action === 'retry') {
      // Безопасный повтор: атомарный захват строки + ядро провайдера (не пересоздаёт
      // уже созданный заказ). Кнопка сбрасывает лимит и заново включает авто-ретрай.
      const res = await retryPosOrder(supabase, logId, true);
      if (res.skipped) return json({ error: res.error || 'Повтор недоступен' }, 409);
      return json({ success: res.ok, status: res.status, error: res.error });
    }

    if (action === 'cancel') {
      const r = await cancelPosOrder(supabase, log);
      const note = r.ok ? undefined
        : `Отмена не выполнена (${r.error}). Возможно, заказ уже закрыт/фискализирован — отмените вручную в POS.`;
      await supabase.from('iiko_order_log').update({ status: 'cancelled', error: note || null, updated_at: new Date().toISOString() }).eq('id', logId);
      return json({ success: true, cancelledInPos: r.ok, note });
    }

    return json({ error: 'Unknown action' }, 400);
  } catch (e) {
    const status = e instanceof IikoError ? e.status : 500;
    console.error('iiko-order error:', e);
    return json({ error: e instanceof Error ? e.message : 'Internal error' }, status);
  }
});
