-- Интеграция с Rosta (next.rosta.kz) — третий POS рядом с iiko и Poster.
-- На партнёра активна только ОДНА интеграция (iiko ИЛИ Poster ИЛИ Rosta) —
-- контролируется в кабинете + диспетчером при скане (см. _shared/pos.ts).
--
-- Особенности Rosta:
--  * авторизация Bearer-ключом партнёра (свой на кофейню);
--  * для создания чека нужна ОТКРЫТАЯ смена (shift) — либо переиспользуем открытую,
--    либо авто-открываем (нужен сотрудник front-офиса);
--  * автозакрытие = закрыть чек на выбранную кассу + способ оплаты;
--  * отмены чека в публичном API НЕТ (отменяется только вручную на кассе);
--  * цены в ТЕНГЕ (целые), не в копейках.

-- Подключение Rosta к кофейне (одна строка на кофейню).
CREATE TABLE IF NOT EXISTS public.rosta_integrations (
  shop_id uuid PRIMARY KEY REFERENCES public.shops(id) ON DELETE CASCADE,
  api_key text NOT NULL,                        -- Bearer-ключ партнёра (секрет)
  tradepoint_id text,                           -- выбранная торговая точка
  tradepoint_name text,
  cashbox_id text,                              -- касса для закрытия чека
  cashbox_name text,
  payment_method_id text,                       -- способ оплаты для закрытия чека
  payment_method_name text,
  user_id text,                                 -- сотрудник front-офиса для открытия смены
  user_name text,
  price_type_id text,                           -- вид цены для меню (необяз., по умолч. Розница)
  price_type_name text,
  auto_open_shift boolean NOT NULL DEFAULT true, -- открывать смену, если нет открытой
  currency text NOT NULL DEFAULT 'KZT',
  auto_close boolean NOT NULL DEFAULT true,      -- закрывать чек на кассу+способ оплаты
  is_active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.rosta_integrations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Shop partner manages rosta integration" ON public.rosta_integrations;
CREATE POLICY "Shop partner manages rosta integration" ON public.rosta_integrations
  FOR ALL USING (public.is_shop_partner(shop_id)) WITH CHECK (public.is_shop_partner(shop_id));

-- Привязка тарифа subday к позиции меню Rosta (на кофейню × тариф).
CREATE TABLE IF NOT EXISTS public.rosta_menu_map (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  subscription_type_id uuid NOT NULL REFERENCES public.subscription_types(id) ON DELETE CASCADE,
  rosta_item_id text NOT NULL,
  rosta_item_name text,
  rosta_price numeric,                          -- цена в ТЕНГЕ (как отдаёт Rosta)
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (shop_id, subscription_type_id)
);

ALTER TABLE public.rosta_menu_map ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Shop partner manages rosta menu map" ON public.rosta_menu_map;
CREATE POLICY "Shop partner manages rosta menu map" ON public.rosta_menu_map
  FOR ALL USING (public.is_shop_partner(shop_id)) WITH CHECK (public.is_shop_partner(shop_id));

CREATE INDEX IF NOT EXISTS idx_rosta_menu_map_shop ON public.rosta_menu_map (shop_id);

-- Журнал заказов iiko_order_log уже обобщён (provider + pos_order_id) в миграции Poster.
-- Для Rosta: provider='rosta', pos_order_id = id чека Rosta.
