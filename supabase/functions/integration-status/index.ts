// Реальный статус интеграции POS (iiko / Poster / Rosta) для кабинета партнёра.
// Не муляж: живые проверки — is_alive кассы (iiko), валидность ключа + доступность
// API (Poster/Rosta), открытая смена (Rosta). Вызывается вручную и авто каждые 5 мин.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getValidToken, getTerminalAlive } from '../_shared/iiko.ts';
import { getSpots } from '../_shared/poster.ts';
import { getTradepoints, getOpenShift } from '../_shared/rosta.ts';
import { setWorkerEnv } from '../_shared/env.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}
type St = 'ok' | 'warn' | 'error' | 'off';
interface Item { key: string; label: string; status: St; detail: string }
const err = (e: unknown) => (e instanceof Error ? e.message : String(e));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function menuCount(supabase: any, table: string, shopId: string, address: string): Promise<number> {
  const { count } = await supabase.from(table).select('*', { count: 'exact', head: true }).eq('shop_id', shopId).eq('address', address);
  return count || 0;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function iikoStatus(supabase: any, shopId: string, address: string): Promise<Item[]> {
  const { data: integ } = await supabase.from('iiko_integrations').select('*').eq('shop_id', shopId).eq('address', address).maybeSingle();
  if (!integ) return [{ key: 'connection', label: 'Подключение', status: 'error', detail: 'Не подключено' }];
  const items: Item[] = [];
  const hasKey = !!(integ.api_key || integ.api_login);

  items.push({
    key: 'connection', label: 'Подключение',
    status: hasKey && integ.organization_id ? 'ok' : (hasKey ? 'warn' : 'error'),
    detail: integ.organization_id ? `Организация: ${integ.organization_name || '—'}` : (hasKey ? 'Организация не выбрана' : 'Нет ключа'),
  });
  items.push({ key: 'payment', label: 'Способ оплаты', status: integ.payment_type_id ? 'ok' : 'error', detail: integ.payment_type_name || 'Не выбран' });
  const menu = await menuCount(supabase, 'iiko_menu_map', shopId, address);
  items.push({ key: 'menu', label: 'Меню', status: menu > 0 ? 'ok' : 'error', detail: menu > 0 ? `${menu} позиц.` : 'Не привязано' });

  // ЖИВАЯ проверка кассы (is_alive). Для дефолт-интеграции проверяем все кассы кофейни.
  let till: Item = { key: 'till', label: 'Касса', status: 'error', detail: 'Не настроена касса' };
  try {
    const q = supabase.from('iiko_terminals').select('terminal_group_id, terminal_group_name, address').eq('shop_id', shopId);
    const { data: terms } = address ? await q.eq('address', address) : await q;
    const list = (terms || []).filter((t: { terminal_group_id?: string }) => t.terminal_group_id);
    if (list.length && integ.organization_id && hasKey) {
      const token = await getValidToken(supabase, integ);
      let online = 0, unknown = 0;
      for (const t of list) {
        const a = await getTerminalAlive(token, integ.organization_id, t.terminal_group_id);
        if (a === true) online++; else if (a === 'unknown' || a === null) unknown++;
      }
      if (online === list.length) till = { key: 'till', label: 'Касса', status: 'ok', detail: `Онлайн${list.length > 1 ? ` (${online}/${list.length})` : ''}` };
      else if (online > 0) till = { key: 'till', label: 'Касса', status: 'warn', detail: `Онлайн ${online} из ${list.length}` };
      else if (unknown === list.length) till = { key: 'till', label: 'Касса', status: 'warn', detail: 'Статус кассы не определён (проверьте кассу)' };
      else till = { key: 'till', label: 'Касса', status: 'error', detail: 'Касса офлайн — заказ не дойдёт' };
    }
  } catch (e) { till = { key: 'till', label: 'Касса', status: 'warn', detail: `Не удалось проверить: ${err(e)}` }; }
  items.push(till);

  items.push({ key: 'active', label: 'Интеграция', status: integ.is_active ? 'ok' : 'off', detail: integ.is_active ? 'Активна' : 'Выключена' });
  return items;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function posterStatus(supabase: any, shopId: string, address: string): Promise<Item[]> {
  const { data: integ } = await supabase.from('poster_integrations').select('*').eq('shop_id', shopId).eq('address', address).maybeSingle();
  if (!integ) return [{ key: 'connection', label: 'Подключение', status: 'error', detail: 'Не подключено' }];
  const items: Item[] = [];

  // ЖИВАЯ проверка: токен валиден + точки доступны.
  let conn: Item = { key: 'connection', label: 'Подключение', status: 'error', detail: 'Нет токена' };
  if (integ.api_token) {
    try { const spots = await getSpots(integ.api_token); conn = { key: 'connection', label: 'Подключение', status: 'ok', detail: `Токен валиден (${spots.length} точек)` }; }
    catch (e) { conn = { key: 'connection', label: 'Подключение', status: 'error', detail: `Токен/связь: ${err(e)}` }; }
  }
  items.push(conn);
  items.push({ key: 'spot', label: 'Точка (касса)', status: integ.spot_id ? 'ok' : 'error', detail: integ.spot_name || 'Не выбрана' });
  const menu = await menuCount(supabase, 'poster_menu_map', shopId, address);
  items.push({ key: 'menu', label: 'Меню', status: menu > 0 ? 'ok' : 'error', detail: menu > 0 ? `${menu} позиц.` : 'Не привязано' });
  items.push({ key: 'autoclose', label: 'Автозакрытие', status: integ.auto_close ? 'ok' : 'off', detail: integ.auto_close ? 'Вкл' : 'Выкл' });
  items.push({ key: 'active', label: 'Интеграция', status: integ.is_active ? 'ok' : 'off', detail: integ.is_active ? 'Активна' : 'Выключена' });
  return items;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function rostaStatus(supabase: any, shopId: string, address: string): Promise<Item[]> {
  const { data: integ } = await supabase.from('rosta_integrations').select('*').eq('shop_id', shopId).eq('address', address).maybeSingle();
  if (!integ) return [{ key: 'connection', label: 'Подключение', status: 'error', detail: 'Не подключено' }];
  const items: Item[] = [];

  // ЖИВАЯ проверка: ключ валиден (тянем точки).
  let conn: Item = { key: 'connection', label: 'Подключение', status: 'error', detail: 'Нет ключа' };
  if (integ.api_key) {
    try { await getTradepoints(integ.api_key); conn = { key: 'connection', label: 'Подключение', status: integ.tradepoint_id ? 'ok' : 'warn', detail: integ.tradepoint_id ? `Точка: ${integ.tradepoint_name || '—'}` : 'Ключ валиден, точка не выбрана' }; }
    catch (e) { conn = { key: 'connection', label: 'Подключение', status: 'error', detail: `Ключ/связь: ${err(e)}` }; }
  }
  items.push(conn);
  const payOk = !!(integ.cashbox_id && integ.payment_method_id);
  items.push({ key: 'payment', label: 'Касса и оплата', status: payOk ? 'ok' : 'error', detail: payOk ? `${integ.cashbox_name || 'касса'} · ${integ.payment_method_name || 'оплата'}` : 'Не выбрана касса/оплата' });

  // ЖИВАЯ проверка: открыта ли смена.
  let shift: Item = { key: 'shift', label: 'Смена', status: 'warn', detail: 'Не проверено' };
  if (integ.api_key && integ.tradepoint_id) {
    try {
      const open = await getOpenShift(integ.api_key, integ.tradepoint_id);
      if (open) shift = { key: 'shift', label: 'Смена', status: 'ok', detail: 'Открыта' };
      else shift = { key: 'shift', label: 'Смена', status: integ.auto_open_shift ? 'warn' : 'error', detail: integ.auto_open_shift ? 'Закрыта (откроем автоматически)' : 'Закрыта — откройте смену' };
    } catch (e) { shift = { key: 'shift', label: 'Смена', status: 'warn', detail: `Не удалось проверить: ${err(e)}` }; }
  }
  items.push(shift);
  const menu = await menuCount(supabase, 'rosta_menu_map', shopId, address);
  items.push({ key: 'menu', label: 'Меню', status: menu > 0 ? 'ok' : 'error', detail: menu > 0 ? `${menu} позиц.` : 'Не привязано' });
  items.push({ key: 'active', label: 'Интеграция', status: integ.is_active ? 'ok' : 'off', detail: integ.is_active ? 'Активна' : 'Выключена' });
  return items;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401);
    let workerEnv: Record<string, string> = {};
    try { workerEnv = JSON.parse(req.headers.get('x-worker-env') || '{}'); } catch { /* ignore */ }
    setWorkerEnv(workerEnv);
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || workerEnv['SUPABASE_URL'];
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || workerEnv['SUPABASE_SERVICE_ROLE_KEY'];
    const supabase = createClient(supabaseUrl!, serviceKey!);

    const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
    if (authErr || !user) return json({ error: 'Unauthorized' }, 401);

    const { shopId, address, provider } = await req.json() as { shopId: string; address?: string; provider: string };
    if (!shopId || !provider) return json({ error: 'shopId и provider обязательны' }, 400);
    const addr = address ?? '';

    const { data: roles } = await supabase.from('user_roles').select('role, shop_id').eq('user_id', user.id);
    const allowed = (roles || []).some((r: { role: string; shop_id: string | null }) => (r.role === 'partner' && r.shop_id === shopId) || r.role === 'admin' || r.role === 'superadmin');
    if (!allowed) return json({ error: 'Нет доступа' }, 403);

    let items: Item[];
    if (provider === 'iiko') items = await iikoStatus(supabase, shopId, addr);
    else if (provider === 'poster') items = await posterStatus(supabase, shopId, addr);
    else if (provider === 'rosta') items = await rostaStatus(supabase, shopId, addr);
    else return json({ error: 'Unknown provider' }, 400);

    return json({ provider, checkedAt: new Date().toISOString(), items });
  } catch (e) {
    console.error('integration-status error:', e);
    return json({ error: err(e) }, 500);
  }
});
