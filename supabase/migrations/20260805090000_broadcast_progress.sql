-- ============================================================================
-- Прогресс рассылки в реальном времени для админки (Telegram и Push).
-- Обе рассылки (telegram-broadcast, send-fcm-push) кладут задачи в
-- broadcast_queue с общим broadcast_id, а шапку — в broadcast_messages.
-- Воркер (cron, раз в минуту) дренит очередь и меняет статусы, поэтому
-- прогресс = агрегат по очереди.
--
-- Доступ: только админ. На broadcast_queue политик RLS нет (deny-all для
-- клиента), поэтому читаем через SECURITY DEFINER.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_broadcast_progress(p_broadcast_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_result jsonb;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role'
     AND NOT has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Недостаточно прав';
  END IF;

  SELECT jsonb_build_object(
    'broadcast_id', p_broadcast_id,
    'channel',      (SELECT channel FROM public.broadcast_queue WHERE broadcast_id = p_broadcast_id LIMIT 1),
    'total',        count(*),
    'sent',         count(*) FILTER (WHERE status = 'sent'),
    'failed',       count(*) FILTER (WHERE status = 'failed'),
    'pending',      count(*) FILTER (WHERE status = 'pending'),
    'processing',   count(*) FILTER (WHERE status = 'processing'),
    -- done = очередь разобрана (в работе ничего не осталось)
    'done',         (count(*) FILTER (WHERE status IN ('pending','processing')) = 0),
    'started_at',   min(created_at),
    'last_at',      max(COALESCE(processed_at, created_at))
  ) INTO v_result
  FROM public.broadcast_queue
  WHERE broadcast_id = p_broadcast_id;

  RETURN COALESCE(v_result, jsonb_build_object('total', 0, 'sent', 0, 'failed', 0, 'pending', 0, 'processing', 0, 'done', true));
END $fn$;

REVOKE ALL ON FUNCTION public.get_broadcast_progress(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_broadcast_progress(uuid) TO authenticated, service_role;

-- Последние рассылки с прогрессом — чтобы админка могла показать статус и для
-- ранее запущенных (например, если страницу перезагрузили во время отправки).
CREATE OR REPLACE FUNCTION public.get_recent_broadcasts(p_type text DEFAULT NULL, p_limit int DEFAULT 5)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_result jsonb;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role'
     AND NOT has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Недостаточно прав';
  END IF;

  SELECT COALESCE(jsonb_agg(x ORDER BY x->>'created_at' DESC), '[]'::jsonb) INTO v_result
  FROM (
    SELECT jsonb_build_object(
      'id', m.id,
      'message', left(m.message, 80),
      'created_at', m.created_at,
      'status', m.status,
      'total', COALESCE(q.total, 0),
      'sent', COALESCE(q.sent, 0),
      'failed', COALESCE(q.failed, 0),
      'pending', COALESCE(q.pending, 0),
      'done', COALESCE(q.pending, 0) = 0
    ) AS x
    FROM public.broadcast_messages m
    LEFT JOIN (
      SELECT broadcast_id,
             count(*) total,
             count(*) FILTER (WHERE status = 'sent') sent,
             count(*) FILTER (WHERE status = 'failed') failed,
             count(*) FILTER (WHERE status IN ('pending','processing')) pending
      FROM public.broadcast_queue GROUP BY broadcast_id
    ) q ON q.broadcast_id = m.id
    WHERE p_type IS NULL OR m.broadcast_type = p_type
    ORDER BY m.created_at DESC
    LIMIT GREATEST(1, LEAST(p_limit, 20))
  ) t;

  RETURN v_result;
END $fn$;

REVOKE ALL ON FUNCTION public.get_recent_broadcasts(text, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_recent_broadcasts(text, int) TO authenticated, service_role;
