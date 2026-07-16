-- Интеграция с Poster (joinposter.com) — второй POS рядом с iiko.
-- На партнёра активна только ОДНА интеграция (iiko ИЛИ Poster) — контролируется
-- в кабинете + диспетчером при скане (см. _shared/pos.ts).

-- Подключение Poster к кофейне (одна строка на кофейню).
CREATE TABLE IF NOT EXISTS public.poster_integrations (
  shop_id uuid PRIMARY KEY REFERENCES public.shops(id) ON DELETE CASCADE,
  api_token text NOT NULL,                 -- токен партнёра, формат "account:hash" (секрет)
  account_name text,                       -- номер/имя аккаунта Poster
  spot_id text,                            -- выбранная точка (spot)
  spot_name text,
  currency text NOT NULL DEFAULT 'KZT',    -- ISO для payment.currency
  auto_close boolean NOT NULL DEFAULT true, -- отмечать заказ предоплаченным (закрытым)
  is_active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.poster_integrations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Shop partner manages poster integration" ON public.poster_integrations;
CREATE POLICY "Shop partner manages poster integration" ON public.poster_integrations
  FOR ALL USING (public.is_shop_partner(shop_id)) WITH CHECK (public.is_shop_partner(shop_id));

-- Привязка тарифа subday к позиции меню Poster (на кофейню × тариф).
CREATE TABLE IF NOT EXISTS public.poster_menu_map (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  subscription_type_id uuid NOT NULL REFERENCES public.subscription_types(id) ON DELETE CASCADE,
  poster_product_id text NOT NULL,
  poster_product_name text,
  poster_price numeric,                    -- цена в копейках (как отдаёт Poster)
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (shop_id, subscription_type_id)
);

ALTER TABLE public.poster_menu_map ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Shop partner manages poster menu map" ON public.poster_menu_map;
CREATE POLICY "Shop partner manages poster menu map" ON public.poster_menu_map
  FOR ALL USING (public.is_shop_partner(shop_id)) WITH CHECK (public.is_shop_partner(shop_id));

CREATE INDEX IF NOT EXISTS idx_poster_menu_map_shop ON public.poster_menu_map (shop_id);

-- Обобщаем журнал заказов под несколько POS: провайдер + внешний id заказа.
ALTER TABLE public.iiko_order_log ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'iiko';
ALTER TABLE public.iiko_order_log ADD COLUMN IF NOT EXISTS pos_order_id text;
