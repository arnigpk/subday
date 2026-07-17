// Крон-воркер авто-ретрая POS-заказов (iiko / Poster / Rosta).
// Вызывается pg_cron раз в минуту service-role ключом. Берёт заказы, которым «пора»
// (status=failed, auto_retry, attempts<5, next_retry_at<=now) и повторяет отправку.
// Защита от двойной отправки — в claim_pos_order_retry (атомарный захват) + ядрах провайдеров.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { retryPosOrder, dueRetryLogIds } from '../_shared/pos.ts';
import { setWorkerEnv } from '../_shared/env.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    let workerEnv: Record<string, string> = {};
    try { workerEnv = JSON.parse(req.headers.get('x-worker-env') || '{}'); } catch { /* ignore */ }
    setWorkerEnv(workerEnv); // секреты iiko для авто-ретрая (обновление токена)
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || workerEnv['SUPABASE_URL'];
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || workerEnv['SUPABASE_SERVICE_ROLE_KEY'];

    // Только сервер (cron шлёт service-role ключ).
    const authHeader = req.headers.get('Authorization') || '';
    if (!serviceKey || authHeader !== `Bearer ${serviceKey}`) return json({ error: 'Forbidden' }, 403);

    const supabase = createClient(supabaseUrl!, serviceKey);
    const ids = await dueRetryLogIds(supabase, 50);
    if (ids.length === 0) return json({ ok: true, processed: 0 });

    // Параллельно (последовательный цикл упёрся бы в лимит времени edge-воркера).
    const results = await Promise.allSettled(ids.map(id => retryPosOrder(supabase, id, false)));
    const created = results.filter(r => r.status === 'fulfilled' && (r.value.status === 'created' || r.value.status === 'closed')).length;
    const failed = results.filter(r => r.status === 'fulfilled' && r.value.status === 'failed').length;

    return json({ ok: true, processed: ids.length, created, failed });
  } catch (e) {
    console.error('pos-order-retry error:', e);
    return json({ error: e instanceof Error ? e.message : 'Internal error' }, 500);
  }
});
