-- ============================================================================
-- Интеграция с iiko Cloud API (iiko Transport).
-- Кабинет партнёра подключает свою кофейню к iiko, привязывает кассы к адресам,
-- тарифы к позициям меню и способ оплаты. При сканировании QR заказ падает на
-- нужную кассу и (опционально) автоматически закрывается на выбранный способ.
-- ============================================================================

-- Помощник: является ли текущий пользователь партнёром ИМЕННО этой кофейни
-- (или админом/суперадмином). SECURITY DEFINER — обходит RLS user_roles.
CREATE OR REPLACE FUNCTION public.is_shop_partner(_shop_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'superadmin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role = 'partner'::app_role
        AND ur.shop_id = _shop_id::text
    );
$$;

-- ---------------------------------------------------------------------------
-- 1. Подключение кофейни к iiko (одна строка на кофейню).
--    api_login — секрет; читают/пишут только партнёр этой кофейни и сервер.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.iiko_integrations (
  shop_id uuid PRIMARY KEY REFERENCES public.shops(id) ON DELETE CASCADE,
  api_login text NOT NULL,                    -- ключ iiko Transport партнёра
  organization_id text,                       -- выбранная организация iiko
  organization_name text,
  payment_type_id text,                       -- «безнал subday» и т.п.
  payment_type_kind text,                     -- Cash / Card / ... (для payments)
  payment_type_name text,
  auto_close boolean NOT NULL DEFAULT true,   -- тумблер автозакрытия чека
  is_active boolean NOT NULL DEFAULT false,   -- включена ли интеграция
  access_token text,                          -- кэш токена iiko (живёт ~1 час)
  token_expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.iiko_integrations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Shop partner manages iiko integration" ON public.iiko_integrations;
CREATE POLICY "Shop partner manages iiko integration" ON public.iiko_integrations
  FOR ALL
  USING (public.is_shop_partner(shop_id))
  WITH CHECK (public.is_shop_partner(shop_id));

-- ---------------------------------------------------------------------------
-- 2. Кассы по адресам (терминалы iiko). Одна строка на адрес кофейни.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.iiko_terminals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  address text NOT NULL,                       -- совпадает с элементом shops.addresses
  terminal_group_id text NOT NULL,             -- касса iiko (terminalGroupId)
  terminal_group_name text,
  order_type_id text,                          -- тип заказа «на вынос»
  order_type_name text,
  auto_close boolean,                          -- переопределение автозакрытия (null = как в интеграции)
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (shop_id, address)
);

ALTER TABLE public.iiko_terminals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Shop partner manages iiko terminals" ON public.iiko_terminals;
CREATE POLICY "Shop partner manages iiko terminals" ON public.iiko_terminals
  FOR ALL
  USING (public.is_shop_partner(shop_id))
  WITH CHECK (public.is_shop_partner(shop_id));

CREATE INDEX IF NOT EXISTS idx_iiko_terminals_shop ON public.iiko_terminals (shop_id);

-- ---------------------------------------------------------------------------
-- 3. Привязка тарифа subday к позиции меню iiko (на кофейню × тариф).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.iiko_menu_map (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  subscription_type_id uuid NOT NULL REFERENCES public.subscription_types(id) ON DELETE CASCADE,
  iiko_product_id text NOT NULL,               -- позиция меню iiko
  iiko_product_name text,
  iiko_price numeric,                          -- цена iiko на момент привязки (для суммы оплаты/автозакрытия)
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (shop_id, subscription_type_id)
);
-- на случай, если таблица уже создана прежней версией миграции
ALTER TABLE public.iiko_menu_map ADD COLUMN IF NOT EXISTS iiko_price numeric;

ALTER TABLE public.iiko_menu_map ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Shop partner manages iiko menu map" ON public.iiko_menu_map;
CREATE POLICY "Shop partner manages iiko menu map" ON public.iiko_menu_map
  FOR ALL
  USING (public.is_shop_partner(shop_id))
  WITH CHECK (public.is_shop_partner(shop_id));

CREATE INDEX IF NOT EXISTS idx_iiko_menu_map_shop ON public.iiko_menu_map (shop_id);

-- ---------------------------------------------------------------------------
-- 4. Журнал заказов iiko. Идемпотентность по redemption_id (один заказ на списание).
--    Пишет только сервер (service role); партнёр видит для истории/отмены.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.iiko_order_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  redemption_id uuid UNIQUE,                   -- идемпотентность
  shop_id uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  address text,
  subscription_type_id uuid,
  iiko_product_id text,
  iiko_product_name text,
  organization_id text,
  terminal_group_id text,
  correlation_id text,                         -- id асинхронной операции iiko
  iiko_order_id text,                          -- id заказа (когда известен)
  status text NOT NULL DEFAULT 'pending',      -- pending | created | closed | failed | cancelled
  auto_close boolean,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.iiko_order_log ENABLE ROW LEVEL SECURITY;

-- Партнёр только читает журнал своей кофейни; запись — только сервер (service role).
DROP POLICY IF EXISTS "Shop partner reads iiko order log" ON public.iiko_order_log;
CREATE POLICY "Shop partner reads iiko order log" ON public.iiko_order_log
  FOR SELECT
  USING (public.is_shop_partner(shop_id));

CREATE INDEX IF NOT EXISTS idx_iiko_order_log_shop ON public.iiko_order_log (shop_id, created_at DESC);
