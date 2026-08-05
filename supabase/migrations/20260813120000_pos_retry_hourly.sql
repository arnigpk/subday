-- Часовая фаза авто-ретрая POS-заказов.
-- Раньше авто-ретрай останавливался после 5 быстрых попыток (attempts<5). Теперь
-- после быстрой фазы (5×1 мин) заказ продолжает ретраиться РАЗ В ЧАС, пока не создастся
-- на кассе, но не дольше суток и не больше RETRY_MAX_TOTAL(=40) попыток
-- (расписание кодируется в next_retry_at + возрастной предел — в dueRetryLogIds).
-- При УСПЕХЕ ретраи прекращаются (status=created/closed, next_retry_at=NULL) — как и раньше.
--
-- Здесь поднимаем предел attempts в атомарном захвате строки, иначе часовые попытки
-- (attempts>=5) не смогли бы захватить строку. Двойная отправка по-прежнему исключена
-- (row-lock + короткое замыкание по pos_order_id в ядрах провайдеров).

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
    AND (_manual OR (auto_retry = true AND attempts < 40))  -- 40 = RETRY_MAX_TOTAL (см. _shared/posRetry.ts)
  RETURNING iiko_order_log.id, iiko_order_log.provider, iiko_order_log.attempts;
$$;
