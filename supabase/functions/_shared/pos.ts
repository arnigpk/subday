// Диспетчер POS: у партнёра активна ОДНА интеграция (Poster ИЛИ iiko).
// Скан и отмена ходят сюда, а дальше — в нужного провайдера.

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { processRedemptionOrder, getValidToken, cancelOrder as iikoCancel } from './iiko.ts';
import { processPosterRedemption, cancelOrder as posterCancel } from './poster.ts';

export interface RedemptionParams {
  redemptionId: string;
  shopId: string;
  address: string | null;
  subscriptionTypeId: string | null;
}

/** Создать заказ у активного провайдера. Оба варианта сами «скипают», если не активны. */
export async function dispatchRedemptionOrder(supabase: SupabaseClient, p: RedemptionParams) {
  const { data: poster } = await supabase.from('poster_integrations')
    .select('is_active').eq('shop_id', p.shopId).maybeSingle();
  if (poster?.is_active) {
    return processPosterRedemption(supabase, {
      redemptionId: p.redemptionId, shopId: p.shopId, subscriptionTypeId: p.subscriptionTypeId,
    });
  }
  return processRedemptionOrder(supabase, p); // iiko (внутри проверяет активность)
}

/** Отмена заказа из журнала — по провайдеру строки. */
export async function cancelPosOrder(
  supabase: SupabaseClient,
  log: { provider?: string | null; shop_id: string; pos_order_id?: string | null; iiko_order_id?: string | null; organization_id?: string | null },
): Promise<{ ok: boolean; error?: string; note?: string }> {
  if (log.provider === 'poster') {
    if (!log.pos_order_id) return { ok: false, error: 'Заказ Poster ещё не создан — отменять нечего' };
    const { data: integ } = await supabase.from('poster_integrations')
      .select('api_token').eq('shop_id', log.shop_id).maybeSingle();
    if (!integ?.api_token) return { ok: false, error: 'Нет токена Poster' };
    return posterCancel(integ.api_token, log.pos_order_id);
  }
  // iiko
  if (!log.iiko_order_id || !log.organization_id) return { ok: false, error: 'Заказ iiko ещё не создан — отменять нечего' };
  const { data: integ } = await supabase.from('iiko_integrations')
    .select('shop_id, api_login, app_id, api_key, client_secret, access_token, token_expires_at')
    .eq('shop_id', log.shop_id).maybeSingle();
  if (!integ) return { ok: false, error: 'Интеграция iiko не найдена' };
  const token = await getValidToken(supabase, integ);
  return iikoCancel(token, log.organization_id, log.iiko_order_id);
}
