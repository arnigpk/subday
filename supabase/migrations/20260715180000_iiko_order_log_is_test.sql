-- Пометка тестовых заказов в журнале (создаются кнопкой «Тестовый заказ» без списания).
ALTER TABLE public.iiko_order_log ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false;
