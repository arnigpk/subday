-- Персональные авто-уведомления (check-subscription-alerts) тоже идут через
-- broadcast_queue: channel='notify', payload = тело запроса к
-- send-subscription-notification. Воркер дренит их с ограниченной конкурентностью.
ALTER TABLE public.broadcast_queue ADD COLUMN IF NOT EXISTS payload jsonb;
