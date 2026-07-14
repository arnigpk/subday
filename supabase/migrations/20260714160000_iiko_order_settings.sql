-- Пилотные настройки модели заказа iiko (выверяются на реальной кассе без правок кода):
--   order_endpoint      — 'order' (быстрый заказ на кассу) | 'delivery' (самовывоз/вынос)
--   fiscalize_externally — помечать чек фискализированным извне
ALTER TABLE public.iiko_integrations ADD COLUMN IF NOT EXISTS order_endpoint text NOT NULL DEFAULT 'order';
ALTER TABLE public.iiko_integrations ADD COLUMN IF NOT EXISTS fiscalize_externally boolean NOT NULL DEFAULT false;
