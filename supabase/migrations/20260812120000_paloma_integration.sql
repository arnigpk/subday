-- Интеграция с Paloma365 (api.paloma365.com) — четвёртый POS рядом с iiko, Poster, Rosta.
-- На адрес кофейни активна ТОЛЬКО ОДНА интеграция (iiko|poster|rosta|paloma) —
-- контролируется в кабинете (взаимное выключение) + диспетчером при скане (_shared/pos.ts).
--
-- Особенности Paloma (Delivery API):
--  * авторизация query-параметрами authkey + class (коннектор доставки) — свой на кофейню;
--  * заказ создаётся сразу «оплаченным» (is_payed=true, delivery_type=2 — самовывоз),
--    отдельного закрытия чека НЕТ (в отличие от Rosta/iiko);
--  * отмена заказа возможна ТОЛЬКО в статусе new (иначе — вручную на кассе);
--  * цены в ТЕНГЕ (как отдаёт меню Paloma), не в копейках.

-- Подключение Paloma к адресу кофейни (ключ (shop_id, address), как у остальных провайдеров).
CREATE TABLE IF NOT EXISTS public.paloma_integrations (
  shop_id uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  address text NOT NULL DEFAULT '',              -- '' = дефолт-интеграция кофейни
  api_key text NOT NULL,                         -- authkey Paloma (секрет)
  connector_class text,                          -- class коннектора доставки Paloma (обязателен для вызовов)
  point_id text,                                 -- выбранная торговая точка
  point_name text,
  currency text NOT NULL DEFAULT 'KZT',
  is_active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (shop_id, address)
);

ALTER TABLE public.paloma_integrations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Shop partner manages paloma integration" ON public.paloma_integrations;
CREATE POLICY "Shop partner manages paloma integration" ON public.paloma_integrations
  FOR ALL USING (public.is_shop_partner(shop_id)) WITH CHECK (public.is_shop_partner(shop_id));

-- Привязка тарифа subday к позиции меню Paloma (на кофейню × адрес × тариф).
CREATE TABLE IF NOT EXISTS public.paloma_menu_map (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  address text NOT NULL DEFAULT '',
  subscription_type_id uuid NOT NULL REFERENCES public.subscription_types(id) ON DELETE CASCADE,
  paloma_item_id text NOT NULL,                  -- object_id позиции меню Paloma
  paloma_item_name text,
  paloma_price numeric,                          -- цена в ТЕНГЕ (как отдаёт Paloma)
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT paloma_menu_map_shop_addr_sub_key UNIQUE (shop_id, address, subscription_type_id)
);

ALTER TABLE public.paloma_menu_map ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Shop partner manages paloma menu map" ON public.paloma_menu_map;
CREATE POLICY "Shop partner manages paloma menu map" ON public.paloma_menu_map
  FOR ALL USING (public.is_shop_partner(shop_id)) WITH CHECK (public.is_shop_partner(shop_id));

CREATE INDEX IF NOT EXISTS idx_paloma_menu_map_shop ON public.paloma_menu_map (shop_id);

-- Журнал заказов iiko_order_log уже обобщён (provider text + pos_order_id, без CHECK-констрейнта).
-- Для Paloma: provider='paloma', pos_order_id = paloma_order_id, а внешний order_id (для отмены/
-- статуса) = id строки журнала.

-- Добавляем paloma в агрегат статусов POS-интеграций для админской страницы кофеен.
CREATE OR REPLACE FUNCTION public.get_shops_integration_status()
RETURNS TABLE (
  shop_id uuid,
  active_count integer,
  inactive_count integer,
  providers text[]   -- провайдеры с включённой интеграцией (iiko/poster/rosta/paloma)
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH all_int AS (
    SELECT shop_id, 'iiko'   AS provider, is_active FROM public.iiko_integrations
    UNION ALL
    SELECT shop_id, 'poster' AS provider, is_active FROM public.poster_integrations
    UNION ALL
    SELECT shop_id, 'rosta'  AS provider, is_active FROM public.rosta_integrations
    UNION ALL
    SELECT shop_id, 'paloma' AS provider, is_active FROM public.paloma_integrations
  )
  SELECT
    all_int.shop_id,
    count(*) FILTER (WHERE all_int.is_active)::int      AS active_count,
    count(*) FILTER (WHERE NOT all_int.is_active)::int  AS inactive_count,
    coalesce(
      array_agg(DISTINCT all_int.provider) FILTER (WHERE all_int.is_active),
      ARRAY[]::text[]
    )                                                   AS providers
  FROM all_int
  WHERE public.has_role(auth.uid(), 'admin')
  GROUP BY all_int.shop_id;
$$;

REVOKE ALL ON FUNCTION public.get_shops_integration_status() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_shops_integration_status() TO authenticated;
