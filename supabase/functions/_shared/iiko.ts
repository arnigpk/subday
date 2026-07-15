// Общий клиент iiko Cloud API (iiko Transport) для edge-функций subday.
// Низкоуровневые вызовы + кэш токена + словари + создание/отмена заказа.
//
// ВАЖНО (пилот): точная модель заказа «на вынос» и флаги автозакрытия
// (isProcessedExternally / isFiscalizedExternally) выверяются на реальной кассе.
// Все такие места помечены комментарием PILOT.

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

export const IIKO_BASE = 'https://api-ru.iiko.services';

export class IikoError extends Error {
  status: number;
  constructor(message: string, status = 500) {
    super(message);
    this.status = status;
  }
}

/**
 * Получить токен iiko. Две схемы авторизации (по OpenAPI-спеке iiko):
 *  • v2 (актуальная) — POST /api/v2/access_token { appId, apiKey, clientSecret }:
 *      apiKey       — ключ ПАРТНЁРА (iikoWeb → «Интеграции → API-ключи», задаёт организации);
 *      appId/secret — учётные данные ПРИЛОЖЕНИЯ subday из iiko Developer Portal
 *                     (public-api.iikoweb.ru/portal), одни на все кофейни — глобальные
 *                     секреты сервера (IIKO_APP_ID / IIKO_CLIENT_SECRET), с возможностью
 *                     переопределения на кофейню через колонки app_id/client_secret.
 *  • v1 (легаси, оставлено как fallback) — POST /api/1/access_token { apiLogin }.
 */
export interface IikoCreds {
  api_login?: string | null;
  app_id?: string | null;
  api_key?: string | null;
  client_secret?: string | null;
}

function globalEnv(name: string): string | undefined {
  try { return Deno.env.get(name) || undefined; } catch { return undefined; }
}

export async function iikoAuth(creds: IikoCreds | string, workerEnv: Record<string, string> = {}): Promise<string> {
  const c: IikoCreds = typeof creds === 'string' ? { api_login: creds } : creds;

  if (c.api_key) {
    const appId = c.app_id || globalEnv('IIKO_APP_ID') || workerEnv['IIKO_APP_ID'];
    const clientSecret = c.client_secret || globalEnv('IIKO_CLIENT_SECRET') || workerEnv['IIKO_CLIENT_SECRET'];
    if (!appId || !clientSecret) {
      throw new IikoError(
        'iiko v2: не настроены appId/clientSecret приложения subday (iiko Developer Portal). Обратитесь в поддержку subday.',
        500,
      );
    }
    const r = await fetch(`${IIKO_BASE}/api/v2/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ appId, apiKey: c.api_key, clientSecret }),
    });
    const data = await r.json().catch(() => ({}));
    if (r.ok && data?.token) return data.token as string;
    throw new IikoError(data?.errorDescription || data?.error || 'iiko v2: неверные учётные данные', 401);
  }

  if (c.api_login) {
    const r = await fetch(`${IIKO_BASE}/api/1/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiLogin: c.api_login }),
    });
    const data = await r.json().catch(() => ({}));
    if (r.ok && data?.token) return data.token as string;
    throw new IikoError(data?.errorDescription || data?.error || 'iiko: неверный apiLogin', 401);
  }

  throw new IikoError('Не заданы учётные данные iiko', 400);
}

/** POST к iiko с Bearer-токеном. Бросает IikoError с текстом ошибки iiko. */
export async function iikoPost<T = any>(token: string, path: string, body: unknown): Promise<T> {
  const r = await fetch(`${IIKO_BASE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify(body ?? {}),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = data?.errorDescription || data?.error || `iiko ${path} -> ${r.status}`;
    throw new IikoError(typeof msg === 'string' ? msg : JSON.stringify(msg), r.status);
  }
  return data as T;
}

/**
 * Валидный токен: из кэша (iiko_integrations) или обновляем и сохраняем.
 * Обновляем за 2 минуты до истечения.
 */
export async function getValidToken(
  supabase: SupabaseClient,
  integ: { shop_id: string; api_login?: string | null; app_id?: string | null; api_key?: string | null; client_secret?: string | null; access_token: string | null; token_expires_at: string | null },
): Promise<string> {
  const now = Date.now();
  const exp = integ.token_expires_at ? new Date(integ.token_expires_at).getTime() : 0;
  if (integ.access_token && exp - now > 120_000) return integ.access_token;

  const token = await iikoAuth(integ);
  const expiresAt = new Date(now + 55 * 60 * 1000).toISOString(); // ~55 мин запас
  await supabase.from('iiko_integrations')
    .update({ access_token: token, token_expires_at: expiresAt, updated_at: new Date().toISOString() })
    .eq('shop_id', integ.shop_id);
  return token;
}

// ---------------------------------------------------------------------------
// Словари
// ---------------------------------------------------------------------------

export async function getOrganizations(token: string) {
  const d = await iikoPost<{ organizations: Array<{ id: string; name: string }> }>(
    token, '/api/1/organizations', { returnAdditionalInfo: false, includeDisabled: false },
  );
  return d.organizations || [];
}

export async function getTerminalGroups(token: string, organizationId: string) {
  const d = await iikoPost<{ terminalGroups: Array<{ organizationId: string; items: Array<{ id: string; name: string; address?: string }> }> }>(
    token, '/api/1/terminal_groups', { organizationIds: [organizationId], includeDisabled: false },
  );
  return (d.terminalGroups || []).flatMap(g => g.items || []);
}

export async function getPaymentTypes(token: string, organizationId: string) {
  const d = await iikoPost<{ paymentTypes: Array<{ id: string; code: string; name: string; paymentTypeKind: string }> }>(
    token, '/api/1/payment_types', { organizationIds: [organizationId] },
  );
  return d.paymentTypes || [];
}

export async function getOrderTypes(token: string, organizationId: string) {
  const d = await iikoPost<{ orderTypes: Array<{ organizationId: string; items: Array<{ id: string; name: string; orderServiceType: string; isDeleted?: boolean }> }> }>(
    token, '/api/1/deliveries/order_types', { organizationIds: [organizationId] },
  );
  return (d.orderTypes || []).flatMap(g => (g.items || []).filter(i => !i.isDeleted));
}

/** Позиции меню (номенклатура) с ценой первой размерности. */
export async function getProducts(token: string, organizationId: string) {
  const d = await iikoPost<{ products: Array<{ id: string; name: string; groupId?: string; sizePrices?: Array<{ price?: { currentPrice?: number } }> }> }>(
    token, '/api/1/nomenclature', { organizationId },
  );
  return (d.products || []).map(p => ({
    id: p.id,
    name: p.name,
    price: p.sizePrices?.[0]?.price?.currentPrice ?? null,
  }));
}

// ---------------------------------------------------------------------------
// Заказ
// ---------------------------------------------------------------------------

export type OrderEndpoint = 'order' | 'delivery';

export interface CreateOrderArgs {
  organizationId: string;
  terminalGroupId: string;
  orderTypeId?: string | null;
  productId: string;
  price: number;               // цена позиции (для суммы оплаты)
  paymentTypeId: string;
  paymentTypeKind: string;
  autoClose: boolean;          // true — оплата обработана (сумма=итог) ⇒ заказ закрывается
  fiscalizeExternally?: boolean; // помечать чек фискализированным извне
  endpoint?: OrderEndpoint;    // 'order' (касса) | 'delivery' (доставка/самовывоз)
  externalNumber?: string;     // идемпотентность/связка (redemption_id)
}

/**
 * Создать заказ «на вынос» в кассе.
 * endpoint='order'    → /api/1/order/create (быстрый заказ на кассу, без стола);
 * endpoint='delivery' → /api/1/deliveries/create (самовывоз, orderServiceType=DeliveryByClient).
 * Обе схемы + флаги вынесены в настройку кофейни, чтобы выверить на пилоте без правок кода.
 * autoClose=true → оплата помечена обработанной ⇒ заказ закрывается на выбранный способ.
 */
export async function createOrder(token: string, a: CreateOrderArgs): Promise<{ correlationId?: string; orderId?: string }> {
  const payment = {
    paymentTypeKind: a.paymentTypeKind,
    sum: a.price,
    paymentTypeId: a.paymentTypeId,
    isProcessedExternally: a.autoClose,
    isFiscalizedExternally: !!a.fiscalizeExternally,
  };
  const items = [{ type: 'Product', productId: a.productId, amount: 1, price: a.price }];

  if (a.endpoint === 'delivery') {
    const body = {
      organizationId: a.organizationId,
      terminalGroupId: a.terminalGroupId,
      order: {
        ...(a.externalNumber ? { externalNumber: a.externalNumber } : {}),
        ...(a.orderTypeId ? { orderTypeId: a.orderTypeId } : {}),
        orderServiceType: 'DeliveryByClient',   // самовывоз/вынос
        customer: { name: 'subday' },
        items,
        payments: [payment],
      },
    };
    const d = await iikoPost<{ correlationId?: string; orderInfo?: { id?: string } }>(token, '/api/1/deliveries/create', body);
    return { correlationId: d.correlationId, orderId: d.orderInfo?.id };
  }

  const body = {
    organizationId: a.organizationId,
    terminalGroupId: a.terminalGroupId,
    order: {
      ...(a.externalNumber ? { externalNumber: a.externalNumber } : {}),
      ...(a.orderTypeId ? { orderTypeId: a.orderTypeId } : {}),
      items,
      payments: [payment],
    },
  };
  const d = await iikoPost<{ correlationId?: string; orderInfo?: { id?: string } }>(token, '/api/1/order/create', body);
  return { correlationId: d.correlationId, orderId: d.orderInfo?.id };
}

/**
 * Создать заказ iiko по факту списания (идемпотентно по redemption_id).
 * Никогда не бросает — возвращает результат; вызывающий не должен падать из-за iiko.
 */
export async function processRedemptionOrder(
  supabase: SupabaseClient,
  p: { redemptionId: string; shopId: string; address: string | null; subscriptionTypeId: string | null },
): Promise<{ ok: boolean; status: string; skipped?: boolean; error?: string }> {
  try {
    // 1) Интеграция активна?
    const { data: integ } = await supabase
      .from('iiko_integrations')
      .select('shop_id, api_login, app_id, api_key, client_secret, organization_id, payment_type_id, payment_type_kind, auto_close, is_active, order_endpoint, fiscalize_externally, access_token, token_expires_at')
      .eq('shop_id', p.shopId)
      .maybeSingle();
    if (!integ || !integ.is_active) return { ok: true, status: 'skipped', skipped: true };

    // 2) Идемпотентность: пытаемся застолбить строку журнала на это списание.
    const { data: inserted, error: insErr } = await supabase
      .from('iiko_order_log')
      .insert({ redemption_id: p.redemptionId, shop_id: p.shopId, address: p.address, subscription_type_id: p.subscriptionTypeId, status: 'pending', organization_id: integ.organization_id })
      .select('id')
      .maybeSingle();
    if (insErr || !inserted) {
      // Уже есть строка на это списание (дубль скан/ретрай) — не создаём второй заказ.
      return { ok: true, status: 'duplicate', skipped: true };
    }
    const logId = inserted.id;
    const fail = async (error: string) => {
      await supabase.from('iiko_order_log').update({ status: 'failed', error, updated_at: new Date().toISOString() }).eq('id', logId);
      return { ok: false, status: 'failed', error };
    };

    if (!integ.organization_id || !integ.payment_type_id) return await fail('Интеграция не настроена (организация/оплата)');

    // 3) Касса по адресу
    let term: { terminal_group_id: string; order_type_id: string | null; auto_close: boolean | null } | null = null;
    if (p.address) {
      const { data } = await supabase.from('iiko_terminals')
        .select('terminal_group_id, order_type_id, auto_close')
        .eq('shop_id', p.shopId).eq('address', p.address).maybeSingle();
      term = data;
    }
    if (!term) {
      // одна касса на кофейню — берём единственную
      const { data: all } = await supabase.from('iiko_terminals')
        .select('terminal_group_id, order_type_id, auto_close').eq('shop_id', p.shopId);
      if (all && all.length === 1) term = all[0];
    }
    if (!term) return await fail('Не найдена касса для адреса');

    // 4) Позиция меню по тарифу
    if (!p.subscriptionTypeId) return await fail('Не определён тариф списания');
    const { data: map } = await supabase.from('iiko_menu_map')
      .select('iiko_product_id, iiko_product_name, iiko_price')
      .eq('shop_id', p.shopId).eq('subscription_type_id', p.subscriptionTypeId).maybeSingle();
    if (!map) return await fail('Тариф не привязан к позиции меню');
    if (map.iiko_price == null) return await fail('У позиции нет цены — перепривяжите тариф');

    // 5) Токен + создание заказа
    const token = await getValidToken(supabase, integ);
    const autoClose = term.auto_close ?? integ.auto_close;
    const res = await createOrder(token, {
      organizationId: integ.organization_id,
      terminalGroupId: term.terminal_group_id,
      orderTypeId: term.order_type_id,
      productId: map.iiko_product_id,
      price: Number(map.iiko_price),
      paymentTypeId: integ.payment_type_id,
      paymentTypeKind: integ.payment_type_kind || 'Card',
      autoClose,
      fiscalizeExternally: !!integ.fiscalize_externally,
      endpoint: (integ.order_endpoint as OrderEndpoint) || 'order',
      externalNumber: p.redemptionId,
    });

    await supabase.from('iiko_order_log').update({
      status: 'created',
      correlation_id: res.correlationId || null,
      iiko_order_id: res.orderId || null,
      terminal_group_id: term.terminal_group_id,
      iiko_product_id: map.iiko_product_id,
      iiko_product_name: map.iiko_product_name,
      auto_close: autoClose,
      updated_at: new Date().toISOString(),
    }).eq('id', logId);

    return { ok: true, status: 'created' };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    // мягкая пометка последней pending-строки как failed
    try {
      await supabase.from('iiko_order_log')
        .update({ status: 'failed', error, updated_at: new Date().toISOString() })
        .eq('redemption_id', p.redemptionId).eq('status', 'pending');
    } catch { /* ignore */ }
    return { ok: false, status: 'failed', error };
  }
}

/**
 * Тестовый заказ из кабинета — создаёт реальный заказ по текущей настройке
 * (тариф+адрес), НО не пишет журнал/списание. Для проверки модели на пилоте.
 */
export async function createTestOrder(
  supabase: SupabaseClient,
  p: { shopId: string; subscriptionTypeId: string; address: string | null },
): Promise<{ ok: boolean; correlationId?: string; error?: string }> {
  try {
    const { data: integ } = await supabase.from('iiko_integrations')
      .select('shop_id, api_login, app_id, api_key, client_secret, organization_id, payment_type_id, payment_type_kind, auto_close, order_endpoint, fiscalize_externally, access_token, token_expires_at')
      .eq('shop_id', p.shopId).maybeSingle();
    if (!integ) return { ok: false, error: 'Интеграция не подключена' };
    if (!integ.organization_id || !integ.payment_type_id) return { ok: false, error: 'Не выбрана организация/оплата' };

    let term: { terminal_group_id: string; order_type_id: string | null; auto_close: boolean | null } | null = null;
    if (p.address) {
      const { data } = await supabase.from('iiko_terminals').select('terminal_group_id, order_type_id, auto_close').eq('shop_id', p.shopId).eq('address', p.address).maybeSingle();
      term = data;
    }
    if (!term) {
      const { data: all } = await supabase.from('iiko_terminals').select('terminal_group_id, order_type_id, auto_close').eq('shop_id', p.shopId);
      if (all && all.length === 1) term = all[0];
    }
    if (!term) return { ok: false, error: 'Не найдена касса для адреса' };

    const { data: map } = await supabase.from('iiko_menu_map').select('iiko_product_id, iiko_price').eq('shop_id', p.shopId).eq('subscription_type_id', p.subscriptionTypeId).maybeSingle();
    if (!map) return { ok: false, error: 'Тариф не привязан к позиции' };
    if (map.iiko_price == null) return { ok: false, error: 'У позиции нет цены' };

    const token = await getValidToken(supabase, integ);
    const res = await createOrder(token, {
      organizationId: integ.organization_id,
      terminalGroupId: term.terminal_group_id,
      orderTypeId: term.order_type_id,
      productId: map.iiko_product_id,
      price: Number(map.iiko_price),
      paymentTypeId: integ.payment_type_id,
      paymentTypeKind: integ.payment_type_kind || 'Card',
      autoClose: term.auto_close ?? integ.auto_close,
      fiscalizeExternally: !!integ.fiscalize_externally,
      endpoint: (integ.order_endpoint as OrderEndpoint) || 'order',
      externalNumber: `test-${Date.now()}`,
    });
    return { ok: true, correlationId: res.correlationId };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function getCommandStatus(token: string, organizationId: string, correlationId: string) {
  return await iikoPost<{ state: string; error?: unknown }>(
    token, '/api/1/commands/status', { organizationId, correlationId },
  );
}

/**
 * Отмена заказа (best-effort). Для уже фискализированного заказа отмена в облаке
 * может быть недоступна — тогда возвращаем ok=false, а локально помечаем cancelled.
 */
export async function cancelOrder(token: string, organizationId: string, orderId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    // PILOT: точный эндпоинт отмены зависит от типа заказа/настроек кассы.
    await iikoPost(token, '/api/1/order/close', { organizationId, orderId });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
