-- Интеграции POS теперь на АДРЕС кофейни, а не на кофейню целиком.
-- У разных адресов может быть свой провайдер/ключ/организация (напр. Coff — второй
-- адрес на другом iiko-аккаунте). Правило «1 активная» становится «1 активная на адрес».
--
-- address = '' — ДЕФОЛТ для адресов без собственной интеграции. Все существующие строки
-- получают address='' → становятся дефолтом, поведение не меняется (обратная совместимость).

-- 1) integrations: +address, PK (shop_id) -> (shop_id, address)
ALTER TABLE public.iiko_integrations   ADD COLUMN IF NOT EXISTS address text NOT NULL DEFAULT '';
ALTER TABLE public.poster_integrations ADD COLUMN IF NOT EXISTS address text NOT NULL DEFAULT '';
ALTER TABLE public.rosta_integrations  ADD COLUMN IF NOT EXISTS address text NOT NULL DEFAULT '';

ALTER TABLE public.iiko_integrations   DROP CONSTRAINT IF EXISTS iiko_integrations_pkey;
ALTER TABLE public.iiko_integrations   ADD PRIMARY KEY (shop_id, address);
ALTER TABLE public.poster_integrations DROP CONSTRAINT IF EXISTS poster_integrations_pkey;
ALTER TABLE public.poster_integrations ADD PRIMARY KEY (shop_id, address);
ALTER TABLE public.rosta_integrations  DROP CONSTRAINT IF EXISTS rosta_integrations_pkey;
ALTER TABLE public.rosta_integrations  ADD PRIMARY KEY (shop_id, address);

-- 2) menu maps: +address, unique (shop_id, address, subscription_type_id)
ALTER TABLE public.iiko_menu_map   ADD COLUMN IF NOT EXISTS address text NOT NULL DEFAULT '';
ALTER TABLE public.poster_menu_map ADD COLUMN IF NOT EXISTS address text NOT NULL DEFAULT '';
ALTER TABLE public.rosta_menu_map  ADD COLUMN IF NOT EXISTS address text NOT NULL DEFAULT '';

ALTER TABLE public.iiko_menu_map   DROP CONSTRAINT IF EXISTS iiko_menu_map_shop_id_subscription_type_id_key;
ALTER TABLE public.iiko_menu_map   ADD CONSTRAINT iiko_menu_map_shop_addr_sub_key UNIQUE (shop_id, address, subscription_type_id);
ALTER TABLE public.poster_menu_map DROP CONSTRAINT IF EXISTS poster_menu_map_shop_id_subscription_type_id_key;
ALTER TABLE public.poster_menu_map ADD CONSTRAINT poster_menu_map_shop_addr_sub_key UNIQUE (shop_id, address, subscription_type_id);
ALTER TABLE public.rosta_menu_map  DROP CONSTRAINT IF EXISTS rosta_menu_map_shop_id_subscription_type_id_key;
ALTER TABLE public.rosta_menu_map  ADD CONSTRAINT rosta_menu_map_shop_addr_sub_key UNIQUE (shop_id, address, subscription_type_id);

-- 3) order log: какой адрес-ключ интеграции обслуживал заказ (для ретрая/отмены).
--    address остаётся ФИЗИЧЕСКИМ адресом списания (для терминала iiko/отображения),
--    integration_address — ключ интеграции (='' если обслужил дефолт).
ALTER TABLE public.iiko_order_log ADD COLUMN IF NOT EXISTS integration_address text NOT NULL DEFAULT '';
