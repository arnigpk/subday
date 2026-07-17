// Диспетчер POS: у партнёра активна ОДНА интеграция (Poster ИЛИ iiko ИЛИ Rosta).
// Скан и отмена ходят сюда, а дальше — в нужного провайдера.

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { processRedemptionOrder, runIikoOrder, getValidToken, cancelOrder as iikoCancel } from './iiko.ts';
import { processPosterRedemption, runPosterOrder, cancelOrder as posterCancel } from './poster.ts';
import { processRostaRedemption, runRostaOrder, cancelOrder as rostaCancel } from './rosta.ts';

export interface RedemptionParams {
  redemptionId: string;
  shopId: string;
  address: string | null;
  subscriptionTypeId: string | null;
}

/**
 * Ключ интеграции для адреса: физический адрес, если для него есть СВОЯ интеграция
 * (любого провайдера), иначе '' — дефолт кофейни (обслуживает адреса без своей интеграции).
 */
export async function resolveAddressKey(supabase: SupabaseClient, shopId: string, address: string | null): Promise<string> {
  if (!address) return '';
  const [ii, po, ro] = await Promise.all([
    supabase.from('iiko_integrations').select('address').eq('shop_id', shopId).eq('address', address).maybeSingle(),
    supabase.from('poster_integrations').select('address').eq('shop_id', shopId).eq('address', address).maybeSingle(),
    supabase.from('rosta_integrations').select('address').eq('shop_id', shopId).eq('address', address).maybeSingle(),
  ]);
  return (ii.data || po.data || ro.data) ? address : '';
}

/** Создать заказ у активного провайдера ДЛЯ АДРЕСА. Каждый вариант сам «скипает», если не активен. */
export async function dispatchRedemptionOrder(supabase: SupabaseClient, p: RedemptionParams) {
  const key = await resolveAddressKey(supabase, p.shopId, p.address);
  const [{ data: poster }, { data: rosta }] = await Promise.all([
    supabase.from('poster_integrations').select('is_active').eq('shop_id', p.shopId).eq('address', key).maybeSingle(),
    supabase.from('rosta_integrations').select('is_active').eq('shop_id', p.shopId).eq('address', key).maybeSingle(),
  ]);
  const base = { redemptionId: p.redemptionId, shopId: p.shopId, address: p.address, integrationAddress: key, subscriptionTypeId: p.subscriptionTypeId };
  if (poster?.is_active) return processPosterRedemption(supabase, base);
  if (rosta?.is_active) return processRostaRedemption(supabase, base);
  return processRedemptionOrder(supabase, base); // iiko (внутри проверяет активность)
}

/**
 * Ретрай одного заказа из журнала (крон ИЛИ ручная кнопка).
 * Сначала АТОМАРНО захватываем строку (failed→pending) через claim_pos_order_retry —
 * это исключает двойную отправку при гонках. Затем запускаем ядро нужного провайдера,
 * которое само не пересоздаёт уже созданный заказ (защита по pos_order_id / order.id).
 */
export async function retryPosOrder(
  supabase: SupabaseClient, logId: string, manual: boolean,
): Promise<{ ok: boolean; status: string; error?: string; skipped?: boolean }> {
  const { data: claimed } = await supabase.rpc('claim_pos_order_retry', { _id: logId, _manual: manual });
  const row = Array.isArray(claimed) ? claimed[0] : claimed;
  if (!row) return { ok: false, status: 'skipped', skipped: true, error: 'Строка недоступна для ретрая (уже создан/в работе/исчерпан лимит)' };
  const attempts: number = row.attempts ?? 0;
  if (row.provider === 'poster') return runPosterOrder(supabase, logId, attempts);
  if (row.provider === 'rosta') return runRostaOrder(supabase, logId, attempts);
  return runIikoOrder(supabase, logId, attempts);
}

/** Список заказов, которым пора авто-ретрай (для крона). */
export async function dueRetryLogIds(supabase: SupabaseClient, limit = 50): Promise<string[]> {
  const nowIso = new Date().toISOString();
  const { data } = await supabase.from('iiko_order_log')
    .select('id, next_retry_at')
    .eq('status', 'failed').eq('auto_retry', true).eq('is_test', false).lt('attempts', 5)
    .or(`next_retry_at.is.null,next_retry_at.lte.${nowIso}`)
    .order('next_retry_at', { ascending: true, nullsFirst: true })
    .limit(limit);
  return (data || []).map((r: { id: string }) => r.id);
}

/** Отмена заказа из журнала — по провайдеру строки. */
export async function cancelPosOrder(
  supabase: SupabaseClient,
  log: { provider?: string | null; shop_id: string; integration_address?: string | null; pos_order_id?: string | null; iiko_order_id?: string | null; organization_id?: string | null },
): Promise<{ ok: boolean; error?: string; note?: string }> {
  const addrKey = log.integration_address ?? '';
  if (log.provider === 'poster') {
    if (!log.pos_order_id) return { ok: false, error: 'Заказ Poster ещё не создан — отменять нечего' };
    const { data: integ } = await supabase.from('poster_integrations')
      .select('api_token').eq('shop_id', log.shop_id).eq('address', addrKey).maybeSingle();
    if (!integ?.api_token) return { ok: false, error: 'Нет токена Poster' };
    return posterCancel(integ.api_token, log.pos_order_id);
  }
  if (log.provider === 'rosta') {
    return rostaCancel(); // публичный API Rosta не умеет отменять чек
  }
  // iiko — организацию берём из интеграции (в журнале старых/новых заказов её могло не быть).
  if (!log.iiko_order_id) return { ok: false, error: 'Заказ iiko ещё не создан — отменять нечего' };
  const { data: integ } = await supabase.from('iiko_integrations')
    .select('shop_id, address, organization_id, api_login, app_id, api_key, client_secret, access_token, token_expires_at')
    .eq('shop_id', log.shop_id).eq('address', addrKey).maybeSingle();
  if (!integ) return { ok: false, error: 'Интеграция iiko не найдена' };
  const orgId = log.organization_id || integ.organization_id;
  if (!orgId) return { ok: false, error: 'Не определена организация iiko' };
  const token = await getValidToken(supabase, integ);
  return iikoCancel(token, orgId, log.iiko_order_id);
}
