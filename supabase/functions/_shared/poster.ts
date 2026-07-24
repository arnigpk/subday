// Общий клиент Poster (joinposter.com) для edge-функций subday.
// Авторизация — токен партнёра в query (?token=account:hash). Цены в КОПЕЙКАХ.

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { failFields, successFields, buildBaristaLabel } from './posRetry.ts';

export const POSTER_BASE = 'https://joinposter.com/api';

export class PosterError extends Error {
  status: number;
  constructor(message: string, status = 400) { super(message); this.status = status; }
}

function checkError(method: string, data: any) {
  if (data && data.error) {
    throw new PosterError(data.message || data.error_message || `Poster ${method}: ошибка ${data.error}`, 400);
  }
}

/** GET-метод Poster (menu.getProducts, spots.getSpots, ...). */
export async function posterGet<T = any>(token: string, method: string, params: Record<string, string | number> = {}): Promise<T> {
  const url = new URL(`${POSTER_BASE}/${method}`);
  url.searchParams.set('token', token);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  const r = await fetch(url.toString(), { method: 'GET' });
  const data = await r.json().catch(() => ({}));
  checkError(method, data);
  return data.response as T;
}

/** POST-метод Poster (incomingOrders.*). Токен — в query, тело — JSON. */
export async function posterPost<T = any>(token: string, method: string, body: unknown): Promise<T> {
  const url = `${POSTER_BASE}/${method}?token=${encodeURIComponent(token)}`;
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body ?? {}) });
  const data = await r.json().catch(() => ({}));
  checkError(method, data);
  return data.response as T;
}

/** Проверка токена: возвращает список точек (spots). Заодно валидирует доступ. */
export async function getSpots(token: string) {
  const list = await posterGet<Array<{ spot_id: string; name?: string; spot_name?: string; address?: string }>>(token, 'spots.getSpots');
  return (list || []).map(s => ({ id: String(s.spot_id), name: s.name || s.spot_name || `Точка ${s.spot_id}`, address: s.address || '' }));
}

/** Позиции меню Poster с ценой (в копейках) для конкретной точки. */
export async function getProducts(token: string, spotId: string) {
  const list = await posterGet<any[]>(token, 'menu.getProducts');
  const priceFor = (p: any): number | null => {
    // Простые товары: spots:[{spot_id, price}]; тех.карты: price:{ "<spot_id>": "30000" }.
    if (Array.isArray(p.spots)) {
      const s = p.spots.find((x: any) => String(x.spot_id) === String(spotId));
      if (s?.price != null) return Number(s.price);
    }
    if (p.price && typeof p.price === 'object') {
      const v = p.price[spotId] ?? p.price[String(spotId)];
      if (v != null) return Number(v);
    }
    if (p.price != null && typeof p.price !== 'object') return Number(p.price);
    return null;
  };
  return (list || []).map(p => ({
    id: String(p.product_id),
    name: p.product_name || p.name || `#${p.product_id}`,
    price: priceFor(p), // копейки
  }));
}

/** Способы оплаты заведения (settings.getPaymentMethods). Только активные. */
export async function getPaymentMethods(token: string) {
  const list = await posterGet<any[]>(token, 'settings.getPaymentMethods');
  return (list || []).filter(m => Number(m.is_active) === 1).map(m => {
    const pt = Number(m.payment_type);
    const kind = pt === 1 ? 'cash' : pt === 2 ? 'card' : pt === 4 ? 'cert' : 'custom';
    return { id: String(m.payment_method_id), name: m.title || `#${m.payment_method_id}`, kind };
  });
}

/** Кассы-терминалы (access.getTablets) — нужен spot_tablet_id для transactions API. */
export async function getTablets(token: string) {
  const list = await posterGet<any[]>(token, 'access.getTablets');
  return (list || []).map(t => ({ id: String(t.tablet_id), name: t.tablet_name || `Касса ${t.tablet_id}`, spotId: String(t.spot_id) }));
}

/** Сотрудники (access.getEmployees) — нужен user_id для создания чека. */
export async function getEmployees(token: string) {
  const list = await posterGet<any[]>(token, 'access.getEmployees');
  return (list || []).map(u => ({ id: String(u.user_id), name: u.name || `Сотрудник ${u.user_id}` }));
}

export interface PosterMethodOrderArgs {
  spotId: string;
  tabletId: string;
  userId: string;
  productId: string;
  priceKopecks: number;         // цена в копейках (как в menu_map); в transactions API делим на 100
  method: { id: string; kind: string };
  comment?: string;             // метка для бариста
}

/**
 * Закрытие чека на КОНКРЕТНЫЙ способ оплаты через transactions API.
 * Создаёт транзакцию и СРАЗУ возвращает её id (через onCreated), чтобы вызывающий
 * зафиксировал pos_order_id до добавления товара/закрытия — тогда ретрай не создаст
 * дубль. Суммы в transactions API — в мажорных единицах (÷100).
 */
export async function createClosedOrderWithMethod(
  token: string, a: PosterMethodOrderArgs, onCreated?: (txId: string) => Promise<void>,
): Promise<{ transactionId: string }> {
  const tr = await posterPost<{ transaction_id?: string | number }>(token, 'transactions.createTransaction', {
    spot_id: a.spotId, spot_tablet_id: a.tabletId, user_id: a.userId, guests_count: 1,
  });
  const txId = String(tr?.transaction_id ?? '');
  if (!txId) throw new PosterError('Poster не вернул transaction_id');
  if (onCreated) await onCreated(txId); // фиксируем id до дальнейших шагов

  await posterPost(token, 'transactions.addTransactionProduct', {
    spot_id: a.spotId, spot_tablet_id: a.tabletId, transaction_id: txId,
    product_id: a.productId, count: 1, price: a.priceKopecks / 100,
  });

  // Метка для бариста (необязательно; сбой комментария не должен рушить заказ).
  if (a.comment) {
    try {
      await posterPost(token, 'transactions.changeComment', {
        spot_id: a.spotId, spot_tablet_id: a.tabletId, transaction_id: txId, comment: a.comment,
      });
    } catch { /* комментарий второстепенен — не мешаем закрытию чека */ }
  }

  const payMajor = a.priceKopecks / 100;
  const body: Record<string, unknown> = { spot_id: a.spotId, spot_tablet_id: a.tabletId, transaction_id: txId };
  if (a.method.kind === 'cash') body.payed_cash = payMajor;
  else if (a.method.kind === 'cert') body.payed_cert = payMajor;
  else if (a.method.kind === 'custom') { body.payed_card = payMajor; body.payment_method_id = a.method.id; }
  else body.payed_card = payMajor; // card
  await posterPost(token, 'transactions.closeTransaction', body);

  return { transactionId: txId };
}

export interface PosterOrderArgs {
  spotId: string;
  productId: string;
  priceKopecks: number;
  currency: string;
  autoClose: boolean;      // true → payment.type=1 (предоплата → закрыт)
  phone?: string;
  comment?: string;        // метка для бариста: «subday · Гость · ID …»
}

/** Создать онлайн-заказ в Poster (падает на терминал точки). */
export async function createOrder(token: string, a: PosterOrderArgs): Promise<{ incomingOrderId?: string; transactionId?: string; status?: number }> {
  const body: Record<string, unknown> = {
    spot_id: a.spotId,
    // Poster требует ВАЛИДНЫЙ телефон (нулевой префикс отвергает). Плейсхолдер выноса.
    phone: a.phone || '+77770000000',
    products: [{ product_id: a.productId, count: 1, price: a.priceKopecks }],
    ...(a.comment ? { comment: a.comment } : {}),
  };
  // Предоплата (заказ закрыт). Без автозакрытия — payment не передаём (кассир закроет).
  if (a.autoClose) body.payment = { type: 1, sum: a.priceKopecks, currency: a.currency };
  const res = await posterPost<{ incoming_order_id?: string | number; transaction_id?: string | number; status?: number }>(token, 'incomingOrders.createIncomingOrder', body);
  return {
    incomingOrderId: res?.incoming_order_id != null ? String(res.incoming_order_id) : undefined,
    transactionId: res?.transaction_id != null ? String(res.transaction_id) : undefined,
    status: res?.status,
  };
}

/**
 * Отмена заказа = удаление ТРАНЗАКЦИИ (transactions.removeTransaction) → уходит с кассы.
 * (changeIncomingOrderStatus нашему приложению недоступен — «Method Not Allowed».)
 */
export async function cancelOrder(token: string, transactionId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    await posterPost(token, 'transactions.removeTransaction', { transaction_id: transactionId });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Создать заказ Poster по факту списания (идемпотентно по redemption_id).
 * Пишет в общий журнал iiko_order_log с provider='poster'. Никогда не бросает.
 */
export async function processPosterRedemption(
  supabase: SupabaseClient,
  p: { redemptionId: string; shopId: string; address?: string | null; integrationAddress?: string | null; subscriptionTypeId: string | null },
): Promise<{ ok: boolean; status: string; skipped?: boolean; error?: string }> {
  try {
    const key = p.integrationAddress ?? '';
    const { data: integ } = await supabase.from('poster_integrations').select('is_active').eq('shop_id', p.shopId).eq('address', key).maybeSingle();
    if (!integ || !integ.is_active) return { ok: true, status: 'skipped', skipped: true };

    const { data: inserted, error: insErr } = await supabase.from('iiko_order_log')
      .insert({ redemption_id: p.redemptionId, shop_id: p.shopId, address: p.address ?? null, integration_address: key, subscription_type_id: p.subscriptionTypeId, provider: 'poster', status: 'pending', attempts: 0 })
      .select('id').maybeSingle();
    if (insErr || !inserted) return { ok: true, status: 'duplicate', skipped: true };
    return await runPosterOrder(supabase, inserted.id, 0);
  } catch (e) {
    return { ok: false, status: 'failed', error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Ядро создания заказа Poster по строке журнала (первая попытка ИЛИ ретрай).
 * Защита от дубля: если pos_order_id уже записан — заказ создан, повторно НЕ создаём.
 * Сбой создания с ответом Poster (PosterError) — заказ точно не создан → авто-ретрай можно;
 * сетевой/неоднозначный сбой — авто-ретрай снимаем (остаётся ручная кнопка). Никогда не бросает.
 */
export async function runPosterOrder(
  supabase: SupabaseClient, logId: string, attempts: number,
): Promise<{ ok: boolean; status: string; error?: string }> {
  const fail = async (error: string, autoRetry = true) => {
    await supabase.from('iiko_order_log').update(failFields(attempts, autoRetry, error)).eq('id', logId);
    return { ok: false, status: 'failed', error };
  };
  try {
    const { data: log } = await supabase.from('iiko_order_log')
      .select('shop_id, integration_address, subscription_type_id, pos_order_id, redemption_id').eq('id', logId).maybeSingle();
    if (!log) return { ok: false, status: 'failed', error: 'Строка журнала не найдена' };
    const key = log.integration_address ?? '';

    const { data: integ } = await supabase.from('poster_integrations')
      .select('api_token, spot_id, spot_tablet_id, user_id, currency, auto_close, is_active, payment_method_id, payment_method_kind')
      .eq('shop_id', log.shop_id).eq('address', key).maybeSingle();
    if (!integ || !integ.is_active) return await fail('Интеграция Poster выключена', false);
    if (!integ.spot_id) return await fail('Poster: не выбрана точка (spot)', false);
    if (!log.subscription_type_id) return await fail('Не определён тариф списания', false);

    // Способ оплаты выбран → закрываем чек на него через transactions API.
    const useMethod = !!(integ.auto_close && integ.payment_method_id && integ.spot_tablet_id && integ.user_id);

    const { data: map } = await supabase.from('poster_menu_map')
      .select('poster_product_id, poster_product_name, poster_price')
      .eq('shop_id', log.shop_id).eq('address', key).eq('subscription_type_id', log.subscription_type_id).maybeSingle();
    if (!map) return await fail('Тариф не привязан к позиции меню Poster', false);
    if (map.poster_price == null) return await fail('У позиции нет цены — перепривяжите тариф', false);

    // ЗАЩИТА ОТ ДУБЛЯ: заказ/чек уже создавался ранее — второй раз не создаём.
    if (log.pos_order_id) {
      await supabase.from('iiko_order_log').update(successFields({
        status: useMethod ? 'closed' : 'created', iiko_product_id: map.poster_product_id, iiko_product_name: map.poster_product_name, auto_close: integ.auto_close,
      })).eq('id', logId);
      return { ok: true, status: useMethod ? 'closed' : 'created' };
    }

    // Метка для бариста: «subday · Гость · ID …».
    const label = await buildBaristaLabel(supabase, log.redemption_id);

    // ── Путь со способом оплаты: transactions API, чек закрывается на выбранный способ.
    if (useMethod) {
      try {
        await createClosedOrderWithMethod(integ.api_token, {
          spotId: integ.spot_id, tabletId: integ.spot_tablet_id!, userId: integ.user_id!,
          productId: map.poster_product_id, priceKopecks: Number(map.poster_price),
          method: { id: integ.payment_method_id!, kind: integ.payment_method_kind || 'card' },
          comment: label.comment,
        }, async (txId) => {
          // Фиксируем id ДО добавления товара/закрытия — ретрай не создаст дубль.
          await supabase.from('iiko_order_log').update({ pos_order_id: txId, updated_at: new Date().toISOString() }).eq('id', logId);
        });
      } catch (e) {
        // Если транзакция успела создаться, pos_order_id уже записан — ретрай не создаст новую.
        const apiRejected = e instanceof PosterError;
        return await fail(e instanceof Error ? e.message : String(e), apiRejected);
      }
      await supabase.from('iiko_order_log').update(successFields({
        status: 'closed', iiko_product_id: map.poster_product_id, iiko_product_name: map.poster_product_name, auto_close: true,
      })).eq('id', logId);
      return { ok: true, status: 'closed' };
    }

    // ── Обычный путь: incoming-order (без выбора способа; авто-предоплата = third_party).
    let res: { incomingOrderId?: string; transactionId?: string; status?: number };
    try {
      res = await createOrder(integ.api_token, {
        spotId: integ.spot_id, productId: map.poster_product_id, priceKopecks: Number(map.poster_price),
        currency: integ.currency || 'KZT', autoClose: integ.auto_close, comment: label.comment,
      });
    } catch (e) {
      // PosterError = Poster ответил ошибкой (заказ НЕ создан) → авто-ретрай безопасен.
      // Иначе (сеть/таймаут) исход неоднозначен → снимаем авто-ретрай.
      const apiRejected = e instanceof PosterError;
      return await fail(e instanceof Error ? e.message : String(e), apiRejected);
    }

    await supabase.from('iiko_order_log').update(successFields({
      status: 'created', pos_order_id: res.transactionId || null,
      iiko_product_id: map.poster_product_id, iiko_product_name: map.poster_product_name, auto_close: integ.auto_close,
    })).eq('id', logId);
    return { ok: true, status: 'created' };
  } catch (e) {
    return await fail(e instanceof Error ? e.message : String(e), false);
  }
}

/** Тестовый заказ Poster (без списания). Пишет в журнал is_test=true, чтобы можно было отменить. */
export async function createPosterTestOrder(
  supabase: SupabaseClient,
  p: { shopId: string; subscriptionTypeId: string; integrationAddress?: string | null },
): Promise<{ ok: boolean; error?: string }> {
  try {
    const key = p.integrationAddress ?? '';
    const { data: integ } = await supabase.from('poster_integrations')
      .select('shop_id, api_token, spot_id, spot_tablet_id, user_id, currency, auto_close, payment_method_id, payment_method_kind')
      .eq('shop_id', p.shopId).eq('address', key).maybeSingle();
    if (!integ) return { ok: false, error: 'Poster не подключён' };
    if (!integ.spot_id) return { ok: false, error: 'Не выбрана точка (spot)' };

    const { data: map } = await supabase.from('poster_menu_map')
      .select('poster_product_id, poster_product_name, poster_price')
      .eq('shop_id', p.shopId).eq('address', key).eq('subscription_type_id', p.subscriptionTypeId).maybeSingle();
    if (!map) return { ok: false, error: 'Тариф не привязан к позиции' };
    if (map.poster_price == null) return { ok: false, error: 'У позиции нет цены' };

    const useMethod = !!(integ.auto_close && integ.payment_method_id && integ.spot_tablet_id && integ.user_id);
    let posOrderId: string | null = null;
    let status = 'created';
    if (useMethod) {
      const r = await createClosedOrderWithMethod(integ.api_token, {
        spotId: integ.spot_id, tabletId: integ.spot_tablet_id, userId: integ.user_id,
        productId: map.poster_product_id, priceKopecks: Number(map.poster_price),
        method: { id: integ.payment_method_id, kind: integ.payment_method_kind || 'card' },
        comment: 'subday · тест',
      });
      posOrderId = r.transactionId; status = 'closed';
    } else {
      const res = await createOrder(integ.api_token, {
        spotId: integ.spot_id, productId: map.poster_product_id, priceKopecks: Number(map.poster_price),
        currency: integ.currency || 'KZT', autoClose: integ.auto_close, comment: 'subday · тест',
      });
      posOrderId = res.transactionId || null;
    }

    await supabase.from('iiko_order_log').insert({
      redemption_id: null, is_test: true, provider: 'poster', shop_id: p.shopId,
      integration_address: key, subscription_type_id: p.subscriptionTypeId, iiko_product_id: map.poster_product_id,
      iiko_product_name: map.poster_product_name, pos_order_id: posOrderId,
      status, auto_close: integ.auto_close,
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Реальный статус транзакции Poster: 'open' | 'closed' | 'cancelled' | 'unknown'.
 * dash.getTransaction.status: 0=новый, 1=распечатан (оба «открыт»), 2=закрыт, 3=удалён.
 * Никогда не бросает: при любой ошибке — 'unknown' (тогда статус в кабинете не меняем).
 */
export async function getPosterOrderStatus(token: string, txId: string): Promise<'open' | 'closed' | 'cancelled' | 'unknown'> {
  try {
    const r = await posterGet<any>(token, 'dash.getTransaction', { transaction_id: txId });
    const row = Array.isArray(r) ? r[0] : r;
    const st = Number(row?.status);
    if (st === 3) return 'cancelled';
    if (st === 2) return 'closed';
    if (st === 0 || st === 1) return 'open';
    return 'unknown';
  } catch { return 'unknown'; }
}

/**
 * Синхронизировать POS-статус недавних заказов Poster в журнал (pos_status).
 * Проверяем только ещё не финализированные (pos_status null/'open'), лимит 30.
 * Если касса сообщает 'cancelled' — заодно переводим наш статус в 'cancelled'.
 * Никогда не бросает.
 */
export async function syncPosterStatuses(supabase: SupabaseClient, shopId: string, address: string): Promise<void> {
  try {
    const { data: integ } = await supabase.from('poster_integrations').select('api_token').eq('shop_id', shopId).eq('address', address).maybeSingle();
    if (!integ?.api_token) return;
    const { data: rows } = await supabase.from('iiko_order_log')
      .select('id, pos_order_id')
      .eq('shop_id', shopId).eq('provider', 'poster').eq('integration_address', address)
      .in('status', ['created', 'closed']).not('pos_order_id', 'is', null)
      .or('pos_status.is.null,pos_status.eq.open')
      .order('created_at', { ascending: false }).limit(30);
    for (const r of (rows || [])) {
      const st = await getPosterOrderStatus(integ.api_token, r.pos_order_id as string);
      if (st === 'unknown') continue;
      const patch: Record<string, unknown> = { pos_status: st, updated_at: new Date().toISOString() };
      if (st === 'cancelled') patch.status = 'cancelled';
      await supabase.from('iiko_order_log').update(patch).eq('id', r.id);
    }
  } catch { /* синхронизация статуса второстепенна — не мешаем кабинету */ }
}
