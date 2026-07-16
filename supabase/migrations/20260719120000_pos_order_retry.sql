-- Авто-ретрай POS-заказов (iiko / Poster / Rosta): счётчик попыток + расписание.
-- Крон-джоба (раз в минуту → pos-order-retry) регистрируется отдельно на сервере
-- (в cron.job, с service-role ключом) — здесь только схема, без секретов.

ALTER TABLE public.iiko_order_log ADD COLUMN IF NOT EXISTS attempts int NOT NULL DEFAULT 0;
ALTER TABLE public.iiko_order_log ADD COLUMN IF NOT EXISTS next_retry_at timestamptz;
-- auto_retry=false → авто-ретрай запрещён (исход создания неоднозначный) — только ручная кнопка.
ALTER TABLE public.iiko_order_log ADD COLUMN IF NOT EXISTS auto_retry boolean NOT NULL DEFAULT true;

-- Быстрая выборка «что пора ретраить» для крона.
CREATE INDEX IF NOT EXISTS idx_iiko_order_log_retry
  ON public.iiko_order_log (next_retry_at)
  WHERE status = 'failed' AND auto_retry = true;

-- Атомарный захват строки под ретрай: переводит failed→pending РОВНО для одного вызова
-- (row-lock на UPDATE). Это ядро защиты «без двойной отправки»: два воркера (крон+ручной,
-- параллельные тики) не смогут одновременно повторно отправить один и тот же заказ.
--   _manual=false (крон): attempts+1, только если auto_retry и attempts<5.
--   _manual=true  (кнопка): сброс attempts=0 и auto_retry=true — новый полный цикл.
-- Возвращает захваченную строку (id, provider, attempts) либо ничего, если строка
-- уже не 'failed' (успех/в работе/исчерпан лимит для крона).
CREATE OR REPLACE FUNCTION public.claim_pos_order_retry(_id uuid, _manual boolean)
RETURNS TABLE (id uuid, provider text, attempts int)
LANGUAGE sql
AS $$
  UPDATE public.iiko_order_log
  SET status = 'pending',
      attempts = CASE WHEN _manual THEN 0 ELSE attempts + 1 END,
      auto_retry = CASE WHEN _manual THEN true ELSE auto_retry END,
      next_retry_at = NULL,
      updated_at = now()
  WHERE iiko_order_log.id = _id
    AND status = 'failed'
    AND is_test = false
    AND (_manual OR (auto_retry = true AND attempts < 5))
  RETURNING iiko_order_log.id, iiko_order_log.provider, iiko_order_log.attempts;
$$;
