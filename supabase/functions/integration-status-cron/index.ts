// Крон-проверка связи касс с облаком POS (раз в 10 минут).
// Пишет журнал integration_status_log ТОЛЬКО при смене состояния — по нему видно
// точный момент, когда касса отвалилась (раньше статус жил лишь на экране кабинета).
// Уведомления не шлём — только журнал.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getValidToken, getTerminalAlive, getTerminalGroups } from '../_shared/iiko.ts';
import { getSpots } from '../_shared/poster.ts';
import { getTradepoints } from '../_shared/rosta.ts';
import { setWorkerEnv } from '../_shared/env.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    let workerEnv: Record<string, string> = {};
    try { workerEnv = JSON.parse(req.headers.get('x-worker-env') || '{}'); } catch { /* ignore */ }
    setWorkerEnv(workerEnv);
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || workerEnv['SUPABASE_URL'];
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || workerEnv['SUPABASE_SERVICE_ROLE_KEY'];

    // Только сервер (крон шлёт service-role ключ).
    const auth = (req.headers.get('Authorization') || '').replace('Bearer ', '');
    if (!serviceKey || auth !== serviceKey) return json({ error: 'Forbidden' }, 403);

    const supabase = createClient(supabaseUrl!, serviceKey);
    // deno-lint-ignore no-explicit-any
    const record = async (shopId: string, address: string, provider: string, status: string, detail: string) => {
      const { data } = await supabase.rpc('record_integration_status', {
        _shop_id: shopId, _address: address, _provider: provider, _status: status, _detail: detail,
      });
      return data === true; // true = состояние сменилось
    };

    const summary = { checked: 0, changed: 0, online: 0, offline: 0, unknown: 0, error: 0 };

    // ---- iiko: связь кассы с облаком (главный индикатор «заказ дойдёт или нет») ----
    const { data: iikoList } = await supabase.from('iiko_integrations')
      .select('shop_id, address, organization_id, api_login, app_id, api_key, client_secret, access_token, token_expires_at')
      .eq('is_active', true);

    for (const integ of (iikoList || [])) {
      const addr = integ.address ?? '';
      let status = 'unknown';
      let detail = '';
      try {
        if (!integ.organization_id) throw new Error('Организация не выбрана');
        const token = await getValidToken(supabase, integ);
        // Кассы этой интеграции: для дефолта ('') — все кассы кофейни.
        const q = supabase.from('iiko_terminals').select('terminal_group_id, address').eq('shop_id', integ.shop_id);
        const { data: terms } = addr ? await q.eq('address', addr) : await q;
        const list = (terms || []).filter((t: { terminal_group_id?: string }) => t.terminal_group_id);

        if (list.length === 0) {
          status = 'error'; detail = 'Касса не настроена';
        } else {
          let online = 0, unknown = 0;
          for (const t of list) {
            const a = await getTerminalAlive(token, integ.organization_id, t.terminal_group_id as string);
            if (a === true) online++; else if (a === 'unknown' || a === null) unknown++;
          }
          if (online === list.length) { status = 'online'; detail = `Онлайн (${online}/${list.length})`; }
          else if (online > 0) { status = 'offline'; detail = `Онлайн ${online} из ${list.length}`; }
          else if (unknown === list.length) {
            // Статуса нет вовсе — уточняем, зарегистрирована ли касса в облаке.
            let known = false;
            try {
              const groups = await getTerminalGroups(token, integ.organization_id);
              known = groups.some((g: { id: string }) => list.some((t: { terminal_group_id?: string }) => t.terminal_group_id === g.id));
            } catch { /* не уточнили */ }
            status = 'unknown';
            detail = known
              ? 'Зарегистрирована, но не на связи с iiko Cloud'
              : 'Не найдена в iiko Cloud';
          } else { status = 'offline'; detail = 'Касса офлайн'; }
        }
      } catch (e) {
        status = 'error'; detail = e instanceof Error ? e.message.slice(0, 200) : 'Ошибка проверки';
      }
      summary.checked++;
      summary[status as 'online' | 'offline' | 'unknown' | 'error']++;
      if (await record(integ.shop_id, addr, 'iiko', status, detail)) summary.changed++;
    }

    // ---- Poster: жив ли токен/доступ ----
    const { data: posterList } = await supabase.from('poster_integrations')
      .select('shop_id, address, api_token').eq('is_active', true);
    for (const integ of (posterList || [])) {
      let status = 'online', detail = 'Токен валиден';
      try { await getSpots(integ.api_token); }
      catch (e) { status = 'error'; detail = (e instanceof Error ? e.message : 'Ошибка').slice(0, 200); }
      summary.checked++;
      summary[status as 'online' | 'error']++;
      if (await record(integ.shop_id, integ.address ?? '', 'poster', status, detail)) summary.changed++;
    }

    // ---- Rosta: жив ли ключ ----
    const { data: rostaList } = await supabase.from('rosta_integrations')
      .select('shop_id, address, api_key').eq('is_active', true);
    for (const integ of (rostaList || [])) {
      let status = 'online', detail = 'Ключ валиден';
      try { await getTradepoints(integ.api_key); }
      catch (e) { status = 'error'; detail = (e instanceof Error ? e.message : 'Ошибка').slice(0, 200); }
      summary.checked++;
      summary[status as 'online' | 'error']++;
      if (await record(integ.shop_id, integ.address ?? '', 'rosta', status, detail)) summary.changed++;
    }

    return json({ ok: true, ...summary });
  } catch (e) {
    console.error('integration-status-cron error:', e);
    return json({ error: e instanceof Error ? e.message : 'Internal error' }, 500);
  }
});
