// Общий клиент Poster (joinposter.com) для edge-функций subday.
// Авторизация — токен партнёра в query (?token=account:hash). Цены в КОПЕЙКАХ.

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

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

export interface PosterOrderArgs {
  spotId: string;
  productId: string;
  priceKopecks: number;
  currency: string;
  autoClose: boolean;      // true → payment.type=1 (предоплата → закрыт)
  phone?: string;
}

/** Создать онлайн-заказ в Poster (падает на терминал точки). */
export async function createOrder(token: string, a: PosterOrderArgs): Promise<{ incomingOrderId?: string; transactionId?: string; status?: number }> {
  const body: Record<string, unknown> = {
    spot_id: a.spotId,
    // Poster требует ВАЛИДНЫЙ телефон (нулевой префикс отвергает). Плейсхолдер выноса.
    phone: a.phone || '+77770000000',
    products: [{ product_id: a.productId, count: 1, price: a.priceKopecks }],
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
  p: { redemptionId: string; shopId: string; subscriptionTypeId: string | null },
): Promise<{ ok: boolean; status: string; skipped?: boolean; error?: string }> {
  try {
    const { data: integ } = await supabase.from('poster_integrations')
      .select('shop_id, api_token, spot_id, currency, auto_close, is_active')
      .eq('shop_id', p.shopId).maybeSingle();
    if (!integ || !integ.is_active) return { ok: true, status: 'skipped', skipped: true };

    // Идемпотентность (общий журнал).
    const { data: inserted, error: insErr } = await supabase.from('iiko_order_log')
      .insert({ redemption_id: p.redemptionId, shop_id: p.shopId, subscription_type_id: p.subscriptionTypeId, provider: 'poster', status: 'pending' })
      .select('id').maybeSingle();
    if (insErr || !inserted) return { ok: true, status: 'duplicate', skipped: true };
    const logId = inserted.id;
    const fail = async (error: string) => {
      await supabase.from('iiko_order_log').update({ status: 'failed', error, updated_at: new Date().toISOString() }).eq('id', logId);
      return { ok: false, status: 'failed', error };
    };

    if (!integ.spot_id) return await fail('Poster: не выбрана точка (spot)');
    if (!p.subscriptionTypeId) return await fail('Не определён тариф списания');

    const { data: map } = await supabase.from('poster_menu_map')
      .select('poster_product_id, poster_product_name, poster_price')
      .eq('shop_id', p.shopId).eq('subscription_type_id', p.subscriptionTypeId).maybeSingle();
    if (!map) return await fail('Тариф не привязан к позиции меню Poster');
    if (map.poster_price == null) return await fail('У позиции нет цены — перепривяжите тариф');

    const res = await createOrder(integ.api_token, {
      spotId: integ.spot_id,
      productId: map.poster_product_id,
      priceKopecks: Number(map.poster_price),
      currency: integ.currency || 'KZT',
      autoClose: integ.auto_close,
    });

    await supabase.from('iiko_order_log').update({
      status: 'created',
      pos_order_id: res.transactionId || null,
      iiko_product_id: map.poster_product_id,
      iiko_product_name: map.poster_product_name,
      auto_close: integ.auto_close,
      updated_at: new Date().toISOString(),
    }).eq('id', logId);

    return { ok: true, status: 'created' };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    try {
      await supabase.from('iiko_order_log').update({ status: 'failed', error, updated_at: new Date().toISOString() })
        .eq('redemption_id', p.redemptionId).eq('provider', 'poster').eq('status', 'pending');
    } catch { /* ignore */ }
    return { ok: false, status: 'failed', error };
  }
}

/** Тестовый заказ Poster (без списания). Пишет в журнал is_test=true, чтобы можно было отменить. */
export async function createPosterTestOrder(
  supabase: SupabaseClient,
  p: { shopId: string; subscriptionTypeId: string },
): Promise<{ ok: boolean; error?: string }> {
  try {
    const { data: integ } = await supabase.from('poster_integrations')
      .select('shop_id, api_token, spot_id, currency, auto_close').eq('shop_id', p.shopId).maybeSingle();
    if (!integ) return { ok: false, error: 'Poster не подключён' };
    if (!integ.spot_id) return { ok: false, error: 'Не выбрана точка (spot)' };

    const { data: map } = await supabase.from('poster_menu_map')
      .select('poster_product_id, poster_product_name, poster_price')
      .eq('shop_id', p.shopId).eq('subscription_type_id', p.subscriptionTypeId).maybeSingle();
    if (!map) return { ok: false, error: 'Тариф не привязан к позиции' };
    if (map.poster_price == null) return { ok: false, error: 'У позиции нет цены' };

    const res = await createOrder(integ.api_token, {
      spotId: integ.spot_id, productId: map.poster_product_id, priceKopecks: Number(map.poster_price),
      currency: integ.currency || 'KZT', autoClose: integ.auto_close,
    });

    await supabase.from('iiko_order_log').insert({
      redemption_id: null, is_test: true, provider: 'poster', shop_id: p.shopId,
      subscription_type_id: p.subscriptionTypeId, iiko_product_id: map.poster_product_id,
      iiko_product_name: map.poster_product_name, pos_order_id: res.transactionId || null,
      status: 'created', auto_close: integ.auto_close,
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
