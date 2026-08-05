// Общий клиент Paloma365 (api.paloma365.com, Delivery API) для edge-функций subday.
// Авторизация — query-параметры authkey + class (коннектор доставки, свой на кофейню).
// Заказ создаётся сразу оплаченным самовывозом (is_payed=true, delivery_type=2);
// отдельного закрытия чека нет. Цены в ТЕНГЕ (целые). Ошибки API — объект {code, info}.

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { failFields, successFields, buildBaristaLabel } from './posRetry.ts';

export const PALOMA_BASE = 'https://api.paloma365.com';

export class PalomaError extends Error {
  status: number;
  constructor(message: string, status = 400) { super(message); this.status = status; }
}

/**
 * Базовый запрос к Paloma. URL: /company/api/?method=...&class=...&authkey=...(&point_id/order_id).
 * Ошибки Paloma приходят объектом {code, info} (часто с HTTP 200) ИЛИ как HTTP != 2xx.
 * Классификация сбоя (для ретрая) идёт по PalomaError.status: 4xx — заказ НЕ создан.
 */
async function palomaRequest<T = any>(
  authkey: string, cls: string, method: string, httpMethod: 'GET' | 'POST',
  opts: { query?: Record<string, string | number>; body?: unknown } = {},
): Promise<T> {
  if (!authkey) throw new PalomaError('Не задан authkey Paloma', 400);
  if (!cls) throw new PalomaError('Не задан class (коннектор) Paloma', 400);
  const url = new URL(`${PALOMA_BASE}/company/api/`);
  url.searchParams.set('method', method);
  url.searchParams.set('class', cls);
  url.searchParams.set('authkey', authkey);
  if (opts.query) for (const [k, v] of Object.entries(opts.query)) url.searchParams.set(k, String(v));

  let r: Response;
  try {
    r = await fetch(url.toString(), {
      method: httpMethod,
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: opts.body != null ? JSON.stringify(opts.body) : undefined,
      signal: AbortSignal.timeout(15000),
    });
  } catch (e) {
    // Сеть/таймаут — исход неоднозначен (status=0 → авто-ретрай снимется).
    throw new PalomaError(e instanceof Error ? e.message : String(e), 0);
  }
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = (data && (data.info || data.message)) || `Paloma ${method}: HTTP ${r.status}`;
    throw new PalomaError(msg, r.status || 400);
  }
  // Ошибка бизнес-уровня: Paloma отдаёт {code, info} с HTTP 200. Заказ НЕ создан → 4xx.
  if (data && typeof data === 'object' && !Array.isArray(data) && data.info != null && data.code != null
      && data.order_id === undefined && data.paloma_order_id === undefined
      && data.item_groups === undefined && data.point_id === undefined) {
    let msg = String(data.info);
    // «Service is not active» (405) — коннектор для меню/заказов не активирован.
    // Обычно значит, что class = демо-«Tester»: точки видны, а меню/заказы недоступны.
    if (/not active/i.test(msg) || data.code === 405) {
      msg = `${msg} — коннектор доставки «${cls}» не активирован в Paloma для меню/заказов. `
        + `«Tester» — демо (видны только точки). Заведите/активируйте свой коннектор доставки в аккаунте Paloma и впишите его класс, либо обратитесь в поддержку Paloma.`;
    }
    throw new PalomaError(msg, 400);
  }
  return data as T;
}

/** Проверка ключа + список торговых точек. */
export async function getPoints(authkey: string, cls: string) {
  const list = await palomaRequest<Array<{ point_id: number | string; name?: string; address?: string }>>(
    authkey, cls, 'points', 'GET');
  return (Array.isArray(list) ? list : []).map(p => ({
    id: String(p.point_id), name: p.name || `Точка ${p.point_id}`, address: p.address || '',
  }));
}

/** Меню (позиции) выбранной точки с ценой в тенге. Плоский список из item_groups[].items[]. */
export async function getMenu(authkey: string, cls: string, pointId: string) {
  const d = await palomaRequest<{ item_groups?: Array<{ items?: Array<{ object_id: number | string; name?: string; price?: number }> }> }>(
    authkey, cls, 'menu', 'GET', { query: pointId ? { point_id: pointId } : {} });
  const out: { id: string; name: string; price: number | null }[] = [];
  for (const g of (d?.item_groups || [])) {
    for (const it of (g?.items || [])) {
      out.push({ id: String(it.object_id), name: it.name || `#${it.object_id}`, price: it.price != null ? Number(it.price) : null });
    }
  }
  return out;
}

export interface PalomaOrderArgs {
  orderId: string;          // наш стабильный id (= id строки журнала) — по нему отмена/статус
  pointId: string;
  itemId: string;
  itemName: string;
  priceTenge: number;
  address: string;          // адрес кофейни (самовывоз)
  customerName: string;     // имя гостя subday (Paloma требует name)
  comment?: string;
}

/** Создать заказ (самовывоз, оплачен). Возвращает paloma_order_id/receipt_id/status. */
export async function createOrder(
  authkey: string, cls: string, a: PalomaOrderArgs,
): Promise<{ palomaOrderId: string | null; receiptId: string | null; status: string }> {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  const itemObjId = /^\d+$/.test(a.itemId) ? Number(a.itemId) : a.itemId;
  const body = {
    order_id: a.orderId,
    date,
    name: a.customerName || 'Клиент subday',
    phone: '+70000000000',                 // Paloma требует phone; заказ по подписке — телефон-заглушка
    address: a.address || '-',
    is_cash: false,
    is_payed: true,                        // оплачено подпиской subday
    total_price: a.priceTenge,
    delivery_type: 2,                      // 2 = самовывоз
    comment: a.comment || 'subday',
    order_items: [{ object_id: itemObjId, name: a.itemName, count: 1, price: a.priceTenge }],
  };
  const res = await palomaRequest<{ paloma_order_id?: number | string; receipt_id?: number | string | null; status?: string }>(
    authkey, cls, 'order', 'POST', { query: { point_id: a.pointId }, body });
  return {
    palomaOrderId: res?.paloma_order_id != null ? String(res.paloma_order_id) : null,
    receiptId: res?.receipt_id != null ? String(res.receipt_id) : null,
    status: res?.status || 'new',
  };
}

/** Отмена заказа (возможна только в статусе new). Никогда не бросает. */
export async function cancelOrder(
  authkey: string, cls: string, orderId: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await palomaRequest<{ status?: string }>(authkey, cls, 'cancel', 'POST', { query: { order_id: orderId } });
    if (res?.status === 'canceled') return { ok: true };
    return { ok: false, error: `Paloma не отменила заказ (статус: ${res?.status || '—'})` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Реальный статус заказа Paloma: new|cooking|on_way|completed|canceled → 'open'|'closed'|'cancelled'|'unknown'. */
export async function getPalomaOrderStatus(
  authkey: string, cls: string, orderId: string,
): Promise<'open' | 'closed' | 'cancelled' | 'unknown'> {
  try {
    const res = await palomaRequest<{ status?: string }>(authkey, cls, 'status', 'GET', { query: { order_id: orderId } });
    const s = res?.status;
    if (s === 'canceled') return 'cancelled';
    if (s === 'completed') return 'closed';
    if (s === 'new' || s === 'cooking' || s === 'on_way') return 'open';
    return 'unknown';
  } catch { return 'unknown'; }
}

/**
 * Создать заказ Paloma по факту списания (идемпотентно по redemption_id).
 * Пишет в общий журнал iiko_order_log с provider='paloma'. Никогда не бросает.
 */
export async function processPalomaRedemption(
  supabase: SupabaseClient,
  p: { redemptionId: string; shopId: string; address?: string | null; integrationAddress?: string | null; subscriptionTypeId: string | null },
): Promise<{ ok: boolean; status: string; skipped?: boolean; error?: string }> {
  try {
    const key = p.integrationAddress ?? '';
    const { data: integ } = await supabase.from('paloma_integrations').select('is_active').eq('shop_id', p.shopId).eq('address', key).maybeSingle();
    if (!integ || !integ.is_active) return { ok: true, status: 'skipped', skipped: true };

    const { data: inserted, error: insErr } = await supabase.from('iiko_order_log')
      .insert({ redemption_id: p.redemptionId, shop_id: p.shopId, address: p.address ?? null, integration_address: key, subscription_type_id: p.subscriptionTypeId, provider: 'paloma', status: 'pending', attempts: 0 })
      .select('id').maybeSingle();
    if (insErr || !inserted) return { ok: true, status: 'duplicate', skipped: true };
    return await runPalomaOrder(supabase, inserted.id, 0);
  } catch (e) {
    return { ok: false, status: 'failed', error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Ядро создания заказа Paloma по строке журнала (первая попытка ИЛИ ретрай).
 * Защита от дубля: если pos_order_id уже записан — заказ создан, повторно НЕ создаём.
 * Внешний order_id, отправляемый в Paloma, = id строки журнала (по нему потом отмена/статус).
 * Классификация сбоя создания: PalomaError 4xx (заказ не создан) → авто-ретрай можно;
 * сеть/таймаут (status=0) → неоднозначно → авто-ретрай снимаем.
 */
export async function runPalomaOrder(
  supabase: SupabaseClient, logId: string, attempts: number,
): Promise<{ ok: boolean; status: string; error?: string }> {
  const fail = async (error: string, autoRetry = true) => {
    await supabase.from('iiko_order_log').update(failFields(attempts, autoRetry, error)).eq('id', logId);
    return { ok: false, status: 'failed', error };
  };
  try {
    const { data: log } = await supabase.from('iiko_order_log')
      .select('shop_id, address, integration_address, subscription_type_id, pos_order_id, redemption_id').eq('id', logId).maybeSingle();
    if (!log) return { ok: false, status: 'failed', error: 'Строка журнала не найдена' };
    const key = log.integration_address ?? '';

    const { data: integ } = await supabase.from('paloma_integrations')
      .select('api_key, connector_class, point_id, is_active').eq('shop_id', log.shop_id).eq('address', key).maybeSingle();
    if (!integ || !integ.is_active) return await fail('Интеграция Paloma выключена', false);
    if (!integ.connector_class) return await fail('Paloma: не задан класс коннектора', false);
    if (!integ.point_id) return await fail('Paloma: не выбрана торговая точка', false);
    if (!log.subscription_type_id) return await fail('Не определён тариф списания', false);

    const { data: map } = await supabase.from('paloma_menu_map')
      .select('paloma_item_id, paloma_item_name, paloma_price')
      .eq('shop_id', log.shop_id).eq('address', key).eq('subscription_type_id', log.subscription_type_id).maybeSingle();
    if (!map) return await fail('Тариф не привязан к позиции меню Paloma', false);
    if (map.paloma_price == null) return await fail('У позиции нет цены — перепривяжите тариф', false);
    const price = Number(map.paloma_price);

    // Заказ уже создан (id записан) — не пересоздаём (у Paloma закрытия чека нет).
    if (log.pos_order_id) {
      await supabase.from('iiko_order_log').update(successFields({
        status: 'created', iiko_product_id: map.paloma_item_id, iiko_product_name: map.paloma_item_name,
      })).eq('id', logId);
      return { ok: true, status: 'created' };
    }

    const { comment, customerName } = await buildBaristaLabel(supabase, log.redemption_id);
    let palomaOrderId: string | null = null;
    try {
      const order = await createOrder(integ.api_key, integ.connector_class, {
        orderId: logId, pointId: integ.point_id, itemId: map.paloma_item_id, itemName: map.paloma_item_name || 'subday',
        priceTenge: price, address: (log.address as string) || '', customerName, comment,
      });
      palomaOrderId = order.palomaOrderId || logId; // фиксируем факт создания даже если id не вернулся
    } catch (e) {
      const st = (e as PalomaError)?.status;
      const notCreated = e instanceof PalomaError && typeof st === 'number' && st >= 400 && st < 500;
      return await fail(e instanceof Error ? e.message : String(e), notCreated);
    }

    await supabase.from('iiko_order_log').update(successFields({
      status: 'created', pos_order_id: palomaOrderId,
      iiko_product_id: map.paloma_item_id, iiko_product_name: map.paloma_item_name,
    })).eq('id', logId);
    return { ok: true, status: 'created' };
  } catch (e) {
    return await fail(e instanceof Error ? e.message : String(e), false);
  }
}

/** Тестовый заказ Paloma (без списания). Пишет в журнал is_test=true. */
export async function createPalomaTestOrder(
  supabase: SupabaseClient,
  p: { shopId: string; subscriptionTypeId: string; integrationAddress?: string | null },
): Promise<{ ok: boolean; error?: string }> {
  try {
    const key = p.integrationAddress ?? '';
    const { data: integ } = await supabase.from('paloma_integrations')
      .select('api_key, connector_class, point_id').eq('shop_id', p.shopId).eq('address', key).maybeSingle();
    if (!integ) return { ok: false, error: 'Paloma не подключён' };
    if (!integ.connector_class) return { ok: false, error: 'Не задан класс коннектора' };
    if (!integ.point_id) return { ok: false, error: 'Не выбрана торговая точка' };

    const { data: map } = await supabase.from('paloma_menu_map')
      .select('paloma_item_id, paloma_item_name, paloma_price')
      .eq('shop_id', p.shopId).eq('address', key).eq('subscription_type_id', p.subscriptionTypeId).maybeSingle();
    if (!map) return { ok: false, error: 'Тариф не привязан к позиции' };
    if (map.paloma_price == null) return { ok: false, error: 'У позиции нет цены' };
    const price = Number(map.paloma_price);

    // Сначала строка журнала (нужен id как order_id для Paloma), затем создаём заказ.
    const { data: row, error: insErr } = await supabase.from('iiko_order_log').insert({
      redemption_id: null, is_test: true, provider: 'paloma', shop_id: p.shopId, address: null,
      integration_address: key, subscription_type_id: p.subscriptionTypeId,
      iiko_product_id: map.paloma_item_id, iiko_product_name: map.paloma_item_name, status: 'pending', attempts: 0,
    }).select('id').maybeSingle();
    if (insErr || !row) return { ok: false, error: 'Не удалось создать тестовую строку журнала' };

    try {
      const order = await createOrder(integ.api_key, integ.connector_class, {
        orderId: row.id, pointId: integ.point_id, itemId: map.paloma_item_id, itemName: map.paloma_item_name || 'subday',
        priceTenge: price, address: '', customerName: 'subday тест', comment: 'subday · тест',
      });
      await supabase.from('iiko_order_log').update(successFields({
        status: 'created', pos_order_id: order.palomaOrderId || row.id,
      })).eq('id', row.id);
      return { ok: true };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await supabase.from('iiko_order_log').update(failFields(0, false, msg)).eq('id', row.id);
      return { ok: false, error: msg };
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Синхронизировать POS-статус недавних заказов Paloma в журнал (pos_status).
 * Отмена, обнаруженная на кассе → cancel_origin='pos' (как iiko/Poster). Не бросает.
 */
export async function syncPalomaStatuses(supabase: SupabaseClient, shopId: string, address: string): Promise<void> {
  try {
    const { data: integ } = await supabase.from('paloma_integrations')
      .select('api_key, connector_class').eq('shop_id', shopId).eq('address', address).maybeSingle();
    if (!integ?.api_key || !integ?.connector_class) return;
    const { data: rows } = await supabase.from('iiko_order_log')
      .select('id, pos_status, status')
      .eq('shop_id', shopId).eq('provider', 'paloma').eq('integration_address', address)
      .in('status', ['created']).order('created_at', { ascending: false }).limit(30);
    const pending = (rows || []).filter(r => r.pos_status == null || r.pos_status === 'open');
    for (const r of pending) {
      // Внешний order_id = id строки журнала.
      const st = await getPalomaOrderStatus(integ.api_key, integ.connector_class, String(r.id));
      if (st === 'unknown') continue;
      const patch: Record<string, unknown> = { pos_status: st, updated_at: new Date().toISOString() };
      if (st === 'cancelled') { patch.status = 'cancelled'; patch.cancel_origin = 'pos'; }
      await supabase.from('iiko_order_log').update(patch).eq('id', r.id);
    }
  } catch { /* синхронизация статуса второстепенна */ }
}
