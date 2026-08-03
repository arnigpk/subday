-- Источник отмены POS-заказа: 'sb' — отменено на стороне subday (кнопка в
-- кабинете / снятие с отправки), 'pos' — отменено на кассе (обнаружено сверкой
-- с iiko/Poster). Нужно, чтобы в интеграциях было однозначно понятно, кто отменил.
-- Единый журнал iiko_order_log хранит все провайдеры (по колонке provider).

ALTER TABLE public.iiko_order_log ADD COLUMN IF NOT EXISTS cancel_origin text;

-- Бэкфилл существующих отмен:
--  • pos_status='cancelled' проставляет ТОЛЬКО сверка с кассой → это 'pos';
--  • остальные отменённые (снятые локально в кабинете) → 'sb'.
UPDATE public.iiko_order_log
   SET cancel_origin = 'pos'
 WHERE status = 'cancelled' AND cancel_origin IS NULL AND pos_status = 'cancelled';

UPDATE public.iiko_order_log
   SET cancel_origin = 'sb'
 WHERE status = 'cancelled' AND cancel_origin IS NULL;
