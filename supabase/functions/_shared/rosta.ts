// Общий клиент Rosta (next.rosta.kz) для edge-функций subday.
// Авторизация — Bearer-ключ партнёра. Цены в ТЕНГЕ (целые). Ответы {data, meta} с пагинацией.

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { failFields, successFields } from './posRetry.ts';

export const ROSTA_BASE = 'https://next.rosta.kz/api/client/public';

export class RostaError extends Error {
  status: number;
  constructor(message: string, status = 400) { super(message); this.status = status; }
}

/** Базовый запрос: Bearer, JSON. Rosta отдаёт ошибки как HTTP != 2xx с телом {message}. */
async function rostaRequest<T = any>(
  apiKey: string, method: 'GET' | 'POST', path: string,
  opts: { query?: Record<string, string | number>; body?: unknown } = {},
): Promise<T> {
  const url = new URL(`${ROSTA_BASE}${path}`);
  if (opts.query) for (const [k, v] of Object.entries(opts.query)) url.searchParams.set(k, String(v));
  const r = await fetch(url.toString(), {
    method,
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: opts.body != null ? JSON.stringify(opts.body) : undefined,
    signal: AbortSignal.timeout(15000),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = data?.message
      || (data?.errors && typeof data.errors === 'object' ? Object.values(data.errors).flat().join('; ') : '')
      || `Rosta ${path}: HTTP ${r.status}`;
    throw new RostaError(msg, r.status || 400); // сохраняем реальный статус для классификации сбоя
  }
  return data as T;
}

/** GET-список с обходом всех страниц (Laravel-пагинация, per_page=20). */
async function listAll<T = any>(apiKey: string, path: string, query: Record<string, string | number> = {}): Promise<T[]> {
  const out: T[] = [];
  let page = 1, lastPage = 1;
  do {
    const d = await rostaRequest<{ data?: T[]; meta?: { last_page?: number } }>(apiKey, 'GET', path, { query: { ...query, page } });
    if (Array.isArray(d?.data)) out.push(...d.data);
    lastPage = d?.meta?.last_page || 1;
    page++;
  } while (page <= lastPage && page <= 100); // защитный предел
  return out;
}

/** Проверка ключа + список торговых точек. */
export async function getTradepoints(apiKey: string) {
  const list = await listAll<{ id: string; name?: string }>(apiKey, '/tradepoints');
  return list.map(t => ({ id: String(t.id), name: t.name || `Точка ${t.id}` }));
}

/** Меню (товары/услуги) с ценой в тенге для выбранного вида цены. */
export async function getItems(apiKey: string, priceTypeId?: string | null) {
  const q: Record<string, string> = {};
  if (priceTypeId) q.price_type_id = priceTypeId;
  const list = await listAll<{ id: string; name?: string; price?: number }>(apiKey, '/items', q);
  return list.map(p => ({ id: String(p.id), name: p.name || `#${p.id}`, price: p.price != null ? Number(p.price) : null }));
}

/** Кассы (для закрытия чека). */
export async function getCashboxes(apiKey: string) {
  const list = await listAll<{ id: string; name?: string; tradepoint_id?: string }>(apiKey, '/cashboxes');
  return list.map(c => ({ id: String(c.id), name: c.name || `Касса ${c.id}`, tradepointId: c.tradepoint_id ? String(c.tradepoint_id) : null }));
}

/** Способы оплаты (для закрытия чека). type: 1=Нал, 2=Безнал, 3=Бонус, 4=Долг. */
export async function getPaymentMethods(apiKey: string) {
  const list = await listAll<{ id: string; name?: string; type?: number }>(apiKey, '/payment-methods');
  return list.map(m => ({ id: String(m.id), name: m.name || `Оплата ${m.id}`, type: m.type ?? null }));
}

/** Сотрудники front-офиса (для открытия смены). */
export async function getUsersFront(apiKey: string) {
  const list = await listAll<{ id: string; name?: string }>(apiKey, '/users/front');
  return list.map(u => ({ id: String(u.id), name: u.name || `Сотрудник ${u.id}` }));
}

/** Виды цен. */
export async function getPriceTypes(apiKey: string) {
  const list = await listAll<{ id: string; name?: string }>(apiKey, '/price-types');
  return list.map(p => ({ id: String(p.id), name: p.name || `Цена ${p.id}` }));
}

/** ID открытой смены (closed_at == null) для точки, либо null. */
export async function getOpenShift(apiKey: string, tradepointId: string): Promise<string | null> {
  const list = await listAll<{ id: string; tradepoint_id?: string; closed_at?: string | null }>(apiKey, '/shifts');
  const open = list.find(s => (s.closed_at == null) && String(s.tradepoint_id) === String(tradepointId));
  return open ? String(open.id) : null;
}

/** Открыть смену. */
export async function openShift(apiKey: string, a: { tradepointId: string; userId: string; workplaceGroupId?: string | null }): Promise<string> {
  const body: Record<string, unknown> = { tradepoint_id: a.tradepointId, user_id: a.userId };
  if (a.workplaceGroupId) body.workplace_group_id = a.workplaceGroupId;
  const res = await rostaRequest<{ data?: { id?: string } }>(apiKey, 'POST', '/shifts', { body });
  const id = res?.data?.id;
  if (!id) throw new RostaError('Rosta не вернул id открытой смены');
  return String(id);
}

/** Гарантировать открытую смену: переиспользовать открытую, иначе (если разрешено) открыть новую. */
export async function ensureShift(
  apiKey: string,
  integ: { tradepoint_id: string; user_id?: string | null; auto_open_shift?: boolean },
): Promise<string> {
  const open = await getOpenShift(apiKey, integ.tradepoint_id);
  if (open) return open;
  if (!integ.auto_open_shift) throw new RostaError('Смена не открыта на кассе Rosta — откройте смену или включите авто-открытие');
  if (!integ.user_id) throw new RostaError('Для авто-открытия смены выберите сотрудника в настройках Rosta');
  return openShift(apiKey, { tradepointId: integ.tradepoint_id, userId: integ.user_id });
}

export interface RostaOrderArgs {
  shiftId: string;
  itemId: string;
  priceTenge: number;
}

/** Создать чек/счёт (нужна открытая смена). Возвращает id чека и статус. */
export async function createOrder(apiKey: string, a: RostaOrderArgs): Promise<{ orderId: string; status?: number }> {
  const body = { shift_id: a.shiftId, items: [{ id: a.itemId, count: 1, price: a.priceTenge }] };
  const res = await rostaRequest<{ data?: { id?: string; status?: { value?: number } } }>(apiKey, 'POST', '/orders', { body });
  const id = res?.data?.id;
  if (!id) throw new RostaError('Rosta не вернул id чека');
  return { orderId: String(id), status: res?.data?.status?.value };
}

/** Закрыть (оплатить) чек на кассу + способ оплаты. */
export async function closeOrder(
  apiKey: string, orderId: string,
  a: { cashboxId: string; paymentMethodId: string; sumTenge: number },
): Promise<{ ok: boolean; error?: string }> {
  try {
    await rostaRequest(apiKey, 'POST', `/orders/${orderId}/close`, {
      body: { cashbox_id: a.cashboxId, payments: [{ method_id: a.paymentMethodId, sum: a.sumTenge }] },
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Создать заказ Rosta по факту списания (идемпотентно по redemption_id).
 * Пишет в общий журнал iiko_order_log с provider='rosta'. Никогда не бросает.
 */
export async function processRostaRedemption(
  supabase: SupabaseClient,
  p: { redemptionId: string; shopId: string; address?: string | null; integrationAddress?: string | null; subscriptionTypeId: string | null },
): Promise<{ ok: boolean; status: string; skipped?: boolean; error?: string }> {
  try {
    const key = p.integrationAddress ?? '';
    const { data: integ } = await supabase.from('rosta_integrations').select('is_active').eq('shop_id', p.shopId).eq('address', key).maybeSingle();
    if (!integ || !integ.is_active) return { ok: true, status: 'skipped', skipped: true };

    const { data: inserted, error: insErr } = await supabase.from('iiko_order_log')
      .insert({ redemption_id: p.redemptionId, shop_id: p.shopId, address: p.address ?? null, integration_address: key, subscription_type_id: p.subscriptionTypeId, provider: 'rosta', status: 'pending', attempts: 0 })
      .select('id').maybeSingle();
    if (insErr || !inserted) return { ok: true, status: 'duplicate', skipped: true };
    return await runRostaOrder(supabase, inserted.id, 0);
  } catch (e) {
    return { ok: false, status: 'failed', error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Ядро создания чека Rosta по строке журнала (первая попытка ИЛИ ретрай).
 * Защита от дубля: если pos_order_id уже записан — чек создан, повторно НЕ создаём
 * (только при необходимости дозакрываем). После создания СРАЗУ фиксируем pos_order_id,
 * чтобы ретрай не создал второй чек. Классификация сбоя создания: ответ Rosta 4xx —
 * чек не создан → авто-ретрай можно; сеть/5xx — неоднозначно → авто-ретрай снимаем.
 */
export async function runRostaOrder(
  supabase: SupabaseClient, logId: string, attempts: number,
): Promise<{ ok: boolean; status: string; error?: string }> {
  const fail = async (error: string, autoRetry = true) => {
    await supabase.from('iiko_order_log').update(failFields(attempts, autoRetry, error)).eq('id', logId);
    return { ok: false, status: 'failed', error };
  };
  try {
    const { data: log } = await supabase.from('iiko_order_log')
      .select('shop_id, integration_address, subscription_type_id, pos_order_id').eq('id', logId).maybeSingle();
    if (!log) return { ok: false, status: 'failed', error: 'Строка журнала не найдена' };
    const key = log.integration_address ?? '';

    const { data: integ } = await supabase.from('rosta_integrations')
      .select('api_key, tradepoint_id, cashbox_id, payment_method_id, user_id, auto_open_shift, auto_close, is_active')
      .eq('shop_id', log.shop_id).eq('address', key).maybeSingle();
    if (!integ || !integ.is_active) return await fail('Интеграция Rosta выключена', false);
    if (!integ.tradepoint_id) return await fail('Rosta: не выбрана торговая точка', false);
    if (!log.subscription_type_id) return await fail('Не определён тариф списания', false);

    const { data: map } = await supabase.from('rosta_menu_map')
      .select('rosta_item_id, rosta_item_name, rosta_price')
      .eq('shop_id', log.shop_id).eq('address', key).eq('subscription_type_id', log.subscription_type_id).maybeSingle();
    if (!map) return await fail('Тариф не привязан к позиции меню Rosta', false);
    if (map.rosta_price == null) return await fail('У позиции нет цены — перепривяжите тариф', false);
    const price = Number(map.rosta_price);

    const finalize = async (orderId: string, status: string, note: string | null) => {
      await supabase.from('iiko_order_log').update(successFields({
        status, error: note, pos_order_id: orderId,
        iiko_product_id: map.rosta_item_id, iiko_product_name: map.rosta_item_name, auto_close: integ.auto_close,
      })).eq('id', logId);
      return { ok: true, status };
    };
    const tryClose = async (orderId: string): Promise<{ status: string; note: string | null }> => {
      if (!integ.auto_close) return { status: 'created', note: null };
      if (!integ.cashbox_id || !integ.payment_method_id) return { status: 'created', note: 'Чек создан открытым: не выбрана касса/способ оплаты для автозакрытия' };
      const closed = await closeOrder(integ.api_key, orderId, { cashboxId: integ.cashbox_id, paymentMethodId: integ.payment_method_id, sumTenge: price });
      return closed.ok ? { status: 'closed', note: null } : { status: 'created', note: `Чек создан, но не закрыт: ${closed.error}` };
    };

    // ЗАЩИТА ОТ ДУБЛЯ: чек уже создавался — не пересоздаём, только (при необходимости) дозакрываем.
    if (log.pos_order_id) {
      const { status, note } = await tryClose(log.pos_order_id);
      return await finalize(log.pos_order_id, status, note);
    }

    // Чека ещё нет — открываем смену и создаём.
    let orderId: string;
    try {
      const shiftId = await ensureShift(integ.api_key, integ);
      const order = await createOrder(integ.api_key, { shiftId, itemId: map.rosta_item_id, priceTenge: price });
      orderId = order.orderId;
    } catch (e) {
      // Rosta ответила ошибкой 4xx (чек НЕ создан) → авто-ретрай безопасен.
      // Сеть/таймаут/5xx → исход неоднозначен → снимаем авто-ретрай (только вручную).
      const st = (e as RostaError)?.status;
      const notCreated = e instanceof RostaError && typeof st === 'number' && st >= 400 && st < 500;
      return await fail(e instanceof Error ? e.message : String(e), notCreated);
    }

    // Чек создан — СРАЗУ фиксируем id (чтобы ретрай не создал дубль), затем закрываем.
    await supabase.from('iiko_order_log').update({ pos_order_id: orderId, updated_at: new Date().toISOString() }).eq('id', logId);
    const { status, note } = await tryClose(orderId);
    return await finalize(orderId, status, note);
  } catch (e) {
    return await fail(e instanceof Error ? e.message : String(e), false);
  }
}

/** Тестовый заказ Rosta (без списания). Пишет в журнал is_test=true. */
export async function createRostaTestOrder(
  supabase: SupabaseClient,
  p: { shopId: string; subscriptionTypeId: string; integrationAddress?: string | null },
): Promise<{ ok: boolean; error?: string }> {
  try {
    const key = p.integrationAddress ?? '';
    const { data: integ } = await supabase.from('rosta_integrations')
      .select('shop_id, api_key, tradepoint_id, cashbox_id, payment_method_id, user_id, auto_open_shift, auto_close')
      .eq('shop_id', p.shopId).eq('address', key).maybeSingle();
    if (!integ) return { ok: false, error: 'Rosta не подключён' };
    if (!integ.tradepoint_id) return { ok: false, error: 'Не выбрана торговая точка' };

    const { data: map } = await supabase.from('rosta_menu_map')
      .select('rosta_item_id, rosta_item_name, rosta_price')
      .eq('shop_id', p.shopId).eq('address', key).eq('subscription_type_id', p.subscriptionTypeId).maybeSingle();
    if (!map) return { ok: false, error: 'Тариф не привязан к позиции' };
    if (map.rosta_price == null) return { ok: false, error: 'У позиции нет цены' };

    const price = Number(map.rosta_price);
    const shiftId = await ensureShift(integ.api_key, integ);
    const order = await createOrder(integ.api_key, { shiftId, itemId: map.rosta_item_id, priceTenge: price });

    let status = 'created';
    let note: string | null = null;
    if (integ.auto_close && integ.cashbox_id && integ.payment_method_id) {
      const closed = await closeOrder(integ.api_key, order.orderId, {
        cashboxId: integ.cashbox_id, paymentMethodId: integ.payment_method_id, sumTenge: price,
      });
      if (closed.ok) status = 'closed'; else note = `Чек создан, но не закрыт: ${closed.error}`;
    } else if (integ.auto_close) {
      note = 'Чек создан открытым: не выбрана касса/способ оплаты для автозакрытия';
    }

    await supabase.from('iiko_order_log').insert({
      redemption_id: null, is_test: true, provider: 'rosta', shop_id: p.shopId,
      integration_address: key, subscription_type_id: p.subscriptionTypeId, iiko_product_id: map.rosta_item_id,
      iiko_product_name: map.rosta_item_name, pos_order_id: order.orderId,
      status, auto_close: integ.auto_close, error: note,
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Отмены чека в публичном API Rosta нет — отменяется только вручную на кассе. */
export function cancelOrder(): { ok: boolean; error: string } {
  return { ok: false, error: 'Rosta API не поддерживает отмену чека — отмените вручную на кассе' };
}
